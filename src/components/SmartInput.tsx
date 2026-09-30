import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule,
  RecordingPresets,
  useAudioRecorder,
} from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import type { Attachment } from '@/domain/types';
import { parseTaskInput } from '@/nlp/parser';
import { isTranscriptionAvailable, transcribeAudioFile } from '@/services/ai/transcribe';
import { useTheme } from '@/theme/ThemeProvider';
import { createId } from '@/utils/id';
import { selection, tapLight, warning } from '@/utils/haptics';

import { Chip, ScalePress, Text } from './ui';

interface SmartInputProps {
  onSubmit: (text: string, attachments: Attachment[]) => Promise<void> | void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Extra row rendered under the field (used for the AI helper hint). */
  hint?: string;
  onAttachmentPress?: () => void;
}

/**
 * Smart Input — the app's primary capture surface.
 *
 * Parsing runs synchronously on every keystroke (the parser is dependency-free
 * and sub-millisecond on realistic inputs), so the user watches the task take
 * shape — resolved date, time, tags, priority — before pressing enter.
 */
export function SmartInput({
  onSubmit,
  placeholder = 'Add a task… try “Send invoice tomorrow 5pm #work !high”',
  autoFocus = false,
  hint,
}: SmartInputProps) {
  const theme = useTheme();
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const parsed = useMemo(() => parseTaskInput(value), [value]);
  const hasContent = value.trim().length > 0 || attachments.length > 0;

  const reset = useCallback(() => {
    setValue('');
    setAttachments([]);
    setStatusNote(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!hasContent || busy) return;
    setBusy(true);
    try {
      await onSubmit(value, attachments);
      reset();
    } catch (error) {
      warning();
      setStatusNote(
        error instanceof Error ? error.message : 'Could not save that — please try again.',
      );
    } finally {
      setBusy(false);
    }
  }, [attachments, busy, hasContent, onSubmit, reset, value]);

  const handlePickImage = useCallback(async () => {
    tapLight();
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setStatusNote('Photo access is off — enable it in Settings to attach images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: false,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    setAttachments((current) => [
      ...current,
      {
        id: createId('att_'),
        kind: 'image',
        uri: asset.uri,
        name: asset.fileName ?? 'photo.jpg',
        createdAt: new Date().toISOString(),
      },
    ]);
    selection();
  }, []);

  const stopRecording = useCallback(async () => {
    setRecording(false);
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri) return;

    if (isTranscriptionAvailable()) {
      setStatusNote('Transcribing…');
      const transcript = await transcribeAudioFile(uri);
      setStatusNote(null);
      if (transcript) {
        setValue((current) => (current ? `${current} ${transcript}` : transcript));
        selection();
        return;
      }
    }

    // No transcription available: keep the audio note as an attachment so the
    // thought is never lost.
    setAttachments((current) => [
      ...current,
      {
        id: createId('att_'),
        kind: 'audio',
        uri,
        name: 'voice-note.m4a',
        createdAt: new Date().toISOString(),
      },
    ]);
    setStatusNote('Voice note attached — transcription needs a configured endpoint.');
  }, [recorder]);

  const toggleRecording = useCallback(async () => {
    if (recording) {
      await stopRecording();
      return;
    }
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      warning();
      setStatusNote('Microphone access is off — enable it to capture voice notes.');
      return;
    }
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      setStatusNote('Listening… tap the mic again to stop.');
      tapLight();
    } catch {
      setStatusNote('Could not start recording on this device.');
    }
  }, [recorder, recording, stopRecording]);

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.xl,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: recording ? theme.colors.danger : theme.colors.border,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        gap: theme.spacing.sm,
        shadowColor: theme.colors.shadow,
        shadowOpacity: 0.12,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
        elevation: 2,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Ionicons name="sparkles" size={16} color={theme.colors.accent} />
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textTertiary}
          autoFocus={autoFocus}
          multiline
          returnKeyType="done"
          // Without this, Return inserts a newline on Android instead of
          // submitting, and the task is never added — the arrow button was the
          // only way to capture anything.
          submitBehavior="submit"
          onSubmitEditing={handleSubmit}
          style={[
            theme.typography.body,
            { flex: 1, color: theme.colors.textPrimary, paddingVertical: 6, maxHeight: 120 },
          ]}
        />

        <Pressable onPress={toggleRecording} hitSlop={8} accessibilityLabel="Voice input">
          <Ionicons
            name={recording ? 'stop-circle' : 'mic-outline'}
            size={20}
            color={recording ? theme.colors.danger : theme.colors.textSecondary}
          />
        </Pressable>

        <Pressable onPress={handlePickImage} hitSlop={8} accessibilityLabel="Attach image">
          <Ionicons name="image-outline" size={20} color={theme.colors.textSecondary} />
        </Pressable>

        <ScalePress
          onPress={handleSubmit}
          disabled={!hasContent || busy}
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: hasContent ? theme.colors.accent : theme.colors.surfaceSunken,
          }}
        >
          {busy ? (
            <ActivityIndicator size="small" color={theme.colors.accentContrast} />
          ) : (
            <Ionicons
              name="arrow-up"
              size={18}
              color={hasContent ? theme.colors.accentContrast : theme.colors.textTertiary}
            />
          )}
        </ScalePress>
      </View>

      {/* Live parse preview — the heart of the smart input. */}
      {parsed.tokens.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {parsed.tokens.map((token) => (
            <Chip
              key={`${token.kind}-${token.start}-${token.text}`}
              label={token.label}
              compact
              icon={ICON_BY_KIND[token.kind]}
              color={COLOR_KIND(token.kind, theme)}
            />
          ))}
        </View>
      ) : null}

      {attachments.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {attachments.map((attachment) => (
            <Chip
              key={attachment.id}
              label={attachment.name ?? attachment.kind}
              compact
              icon={attachment.kind === 'image' ? 'image' : 'musical-notes'}
              onPress={() => setAttachments((c) => c.filter((a) => a.id !== attachment.id))}
            />
          ))}
        </View>
      ) : null}

      {statusNote ?? hint ? (
        <Text variant="micro" color={theme.colors.textTertiary}>
          {statusNote ?? hint}
        </Text>
      ) : null}
    </View>
  );
}

const ICON_BY_KIND: Record<
  string,
  React.ComponentProps<typeof Ionicons>['name']
> = {
  date: 'calendar-outline',
  time: 'time-outline',
  priority: 'flag-outline',
  tag: 'pricetag-outline',
  project: 'folder-outline',
  recurrence: 'repeat-outline',
  estimate: 'hourglass-outline',
  location: 'location-outline',
};

function COLOR_KIND(kind: string, theme: ReturnType<typeof useTheme>): string {
  switch (kind) {
    case 'priority':
      return theme.colors.warning;
    case 'tag':
      return theme.colors.accent;
    case 'date':
    case 'time':
      return theme.colors.success;
    case 'recurrence':
      return theme.swatches[5];
    default:
      return theme.colors.textSecondary;
  }
}
