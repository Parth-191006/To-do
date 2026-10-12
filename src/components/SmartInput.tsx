import { Ionicons } from '@expo/vector-icons';
import { AudioModule, RecordingPresets, useAudioRecorder } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { Attachment } from '@/domain/types';
import { parseTaskInput } from '@/nlp/parser';
import { isTranscriptionAvailable, transcribeAudioFile } from '@/services/ai/transcribe';
import { requestPermissionWithPrimer } from '@/store/usePermissionPrompt';
import { useTheme } from '@/theme/ThemeProvider';
import { createId } from '@/utils/id';
import { selection, tapLight, warning } from '@/utils/haptics';

import { Chip, ScalePress, Text } from './ui';

interface SmartInputProps {
  onSubmit: (text: string, attachments: Attachment[]) => Promise<void> | void;
  /** Headline for the field — tells the user where the task will land. */
  label?: string;
  autoFocus?: boolean;
  /** Shown above nothing else is happening; explains what the field understands. */
  hint?: string;
}

/**
 * Smart Input — the app's primary capture surface.
 *
 * Parsing runs synchronously on every keystroke (the parser is dependency-free
 * and sub-millisecond on realistic inputs), so the user watches the task take
 * shape — resolved date, time, tags, priority — before pressing enter.
 *
 * The field carries a two-word placeholder rather than an example sentence: an
 * example read as pre-filled content and got in the way, but an unlabelled box
 * gave no clue what to do with it. The syntax itself is taught by the hint line
 * under the field, which disappears the moment there is something to parse.
 */
export function SmartInput({ onSubmit, label = 'Quick add', autoFocus = false, hint }: SmartInputProps) {
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

  const handlePickImage = useCallback(async (source: 'library' | 'camera' = 'library') => {
    tapLight();
    // Explain first — the OS dialog only appears once per install, and the
    // camera gets its own explanation rather than borrowing the photo
    // library's: they are separate system permissions with separate denials.
    const explained = await requestPermissionWithPrimer(source === 'camera' ? 'camera' : 'photos');
    if (!explained) return;

    if (source === 'camera') {
      const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
      if (!cameraPermission.granted) {
        setStatusNote('Camera access is off — enable it in Settings to snap a photo.');
        return;
      }
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setStatusNote('Photo access is off — enable it in Settings to attach images.');
        return;
      }
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({
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
    const explained = await requestPermissionWithPrimer('microphone');
    if (!explained) {
      warning();
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
      setStatusNote('Listening… tap Stop when you are done.');
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
        paddingVertical: theme.spacing.sm,
        gap: theme.spacing.sm,
      }}
    >
      {/*
        Live parse preview — the heart of the smart input, and deliberately
        *above* the field: the chips are the answer to "did it understand me?",
        so they belong between the eye and the keyboard, not underneath it.

        No "DETECTED" heading and no card label above it: the chips only appear
        once the parser has matched something, so their presence already says
        what they are.
      */}
      {parsed.tokens.length > 0 ? (
        <View style={{ gap: 6 }}>
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
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm }}>
        <TextInput
          value={value}
          onChangeText={setValue}
          // A two-word prompt, not an example sentence. An example in the
          // placeholder read as pre-filled content and made the user delete it
          // before typing; without *any* prompt the field was an unlabelled
          // box, now that the card no longer carries a header of its own.
          placeholder="Add a task…"
          placeholderTextColor={theme.colors.textTertiary}
          testID="quick-add-input"
          autoFocus={autoFocus}
          multiline
          returnKeyType="done"
          // Without this, Return inserts a newline on Android instead of
          // submitting, and the task is never added.
          submitBehavior="submit"
          onSubmitEditing={handleSubmit}
          accessibilityLabel={label}
          style={[
            theme.typography.body,
            { flex: 1, color: theme.colors.textPrimary, paddingVertical: 8, minHeight: 44, maxHeight: 120 },
          ]}
        />

        {/* Voice + camera sit inline with the field: one row, no hunting. */}
        <IconAction
          icon={recording ? 'stop' : 'mic-outline'}
          label={recording ? 'Stop recording' : 'Record a voice note'}
          active={recording}
          onPress={() => void toggleRecording()}
        />
        <IconAction
          icon="camera-outline"
          label="Take a photo"
          onPress={() => void handlePickImage('camera')}
        />
        <IconAction
          icon="images-outline"
          label="Attach a photo from your library"
          onPress={() => void handlePickImage('library')}
        />

        <ScalePress
          onPress={handleSubmit}
          disabled={!hasContent || busy}
          testID="quick-add-submit"
          accessibilityRole="button"
          accessibilityLabel={hasContent ? 'Add task' : 'Add task — type something first'}
          accessibilityState={{ disabled: !hasContent || busy }}
          style={{
            width: 40,
            height: 40,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.radii.pill,
            // Enabled state is the accent, not a grey that reads as disabled.
            backgroundColor: hasContent ? theme.colors.accent : theme.colors.surfaceSunken,
          }}
        >
          {busy ? (
            <ActivityIndicator size="small" color={theme.colors.accentContrast} />
          ) : (
            <Ionicons
              name="arrow-up"
              size={19}
              color={hasContent ? theme.colors.accentContrast : theme.colors.textTertiary}
            />
          )}
        </ScalePress>
      </View>

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

      {/*
        The hint is only shown while the field is empty. As a permanent line it
        was a paragraph of documentation sitting under the keyboard, read once
        and then ignored forever; as the field's placeholder-state it teaches
        at exactly the moment it is useful, and gets out of the way after that.
      */}
      {statusNote ? (
        <Text variant="caption" color={theme.colors.textSecondary}>
          {statusNote}
        </Text>
      ) : hint && !hasContent ? (
        <Text variant="caption" color={theme.colors.textTertiary}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Round icon button used for the capture extras: no background or border until
 * it is active, so three of them in a row read as three quiet glyphs rather
 * than three buttons. 40dp square plus `hitSlop` still clears the 48dp touch
 * target.
 */
function IconAction({
  icon,
  label,
  onPress,
  active = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  const theme = useTheme();
  const tint = active ? theme.colors.danger : theme.colors.textTertiary;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radii.pill,
        backgroundColor: active ? theme.colors.dangerSoft : 'transparent',
      }}
    >
      <Ionicons name={icon} size={18} color={tint} />
    </Pressable>
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
