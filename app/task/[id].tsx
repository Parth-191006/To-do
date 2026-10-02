import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TaskCard } from '@/components/TaskCard';
import { TaskEditorSheet } from '@/components/TaskEditorSheet';
import { BottomSheet } from '@/components/BottomSheet';
import { Card, Chip, EmptyState, Text } from '@/components/ui';
import type { Attachment } from '@/domain/types';
import { describeRecurrence } from '@/nlp/parser';
import { childrenOf } from '@/store/selectors';
import { useStore } from '@/store/useStore';
import { useTheme } from '@/theme/ThemeProvider';
import { success, tapHeavy } from '@/utils/haptics';

export default function TaskDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const tasks = useStore((state) => state.tasks);
  const projects = useStore((state) => state.projects);
  const tags = useStore((state) => state.tags);
  const toggleTask = useStore((state) => state.toggleTask);
  const removeTask = useStore((state) => state.removeTask);
  const breakDownTask = useStore((state) => state.breakDownTask);
  const addTask = useStore((state) => state.addTask);

  const [editing, setEditing] = useState(false);
  const [subtaskSheet, setSubtaskSheet] = useState(false);

  const task = useMemo(() => tasks.find((entry) => entry.id === id) ?? null, [id, tasks]);
  const subtasks = useMemo(() => (task ? childrenOf(tasks, task.id) : []), [task, tasks]);
  const project = projects.find((entry) => entry.id === task?.projectId) ?? null;

  const handleBreakDown = useCallback(async () => {
    if (!task) return;
    tapHeavy();
    await breakDownTask(task.id);
    success();
  }, [breakDownTask, task]);

  if (!task) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top + 60 }}>
        <EmptyState icon="alert-circle-outline" title="Task not found" subtitle="It may have been deleted." />
        <View style={{ alignItems: 'center' }}>
          <Chip label="Go back" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const done = task.status === 'done';

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          paddingTop: insets.top + theme.spacing.sm,
          paddingHorizontal: theme.spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.textSecondary} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Chip label="Edit" icon="create-outline" onPress={() => setEditing(true)} />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          paddingBottom: insets.bottom + 80,
          gap: theme.spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md }}>
            <Pressable onPress={() => { success(); void toggleTask(task.id); }} hitSlop={10}>
              <Ionicons
                name={done ? 'checkmark-circle' : 'ellipse-outline'}
                size={30}
                color={done ? theme.colors.success : theme.colors.borderStrong}
              />
            </Pressable>
            <Text variant="title" style={{ flex: 1, textDecorationLine: done ? 'line-through' : 'none' }}>
              {task.title}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginLeft: 42 }}>
            {task.dueAt ? (
              <Chip
                label={new Date(task.dueAt).toLocaleString(undefined, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
                icon="calendar-outline"
              />
            ) : null}
            {task.priority !== 'none' ? (
              <Chip label={task.priority} icon="flag-outline" color={theme.colors.priority[task.priority]} />
            ) : null}
            {task.recurrence ? (
              <Chip label={describeRecurrence(task.recurrence)} icon="repeat-outline" />
            ) : null}
            {task.estimateMinutes ? (
              <Chip label={`${task.estimateMinutes}m`} icon="hourglass-outline" />
            ) : null}
            {project ? <Chip label={project.name} color={project.color} icon="folder-outline" /> : null}
            {task.locationReminder ? (
              <Chip label={task.locationReminder.label} icon="location-outline" color={theme.colors.success} />
            ) : null}
          </View>

          {task.tagIds.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginLeft: 42 }}>
              {task.tagIds.map((tagId) => {
                const tag = tags.find((entry) => entry.id === tagId);
                if (!tag) return null;
                return <Chip key={tagId} label={`#${tag.name}`} color={tag.color} compact />;
              })}
            </View>
          ) : null}
        </View>

        {task.notes ? (
          <Card>
            <Text variant="body" color={theme.colors.textSecondary}>
              {task.notes}
            </Text>
          </Card>
        ) : null}

        {/* Attachments were saved but never rendered before — a photo or voice
            note added from Smart Input was invisible the moment you opened
            the task. */}
        {task.attachments.length > 0 ? (
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="heading">Attachments</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              {task.attachments.map((attachment) =>
                attachment.kind === 'image' ? (
                  <Image
                    key={attachment.id}
                    source={{ uri: attachment.uri }}
                    style={{
                      width: 104,
                      height: 104,
                      borderRadius: theme.radii.lg,
                      backgroundColor: theme.colors.surfaceSunken,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                    }}
                  />
                ) : (
                  <AudioAttachment key={attachment.id} attachment={attachment} />
                ),
              )}
            </View>
          </View>
        ) : null}

        <View style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text variant="heading">Subtasks</Text>
            <View style={{ flex: 1 }} />
            <Text variant="caption" color={theme.colors.textTertiary}>
              {subtasks.filter((entry) => entry.status === 'done').length}/{subtasks.length}
            </Text>
          </View>

          {subtasks.length === 0 ? (
            <Card>
              <View style={{ gap: theme.spacing.md }}>
                <Text variant="caption" color={theme.colors.textSecondary}>
                  No subtasks yet. Let the AI plan this one out, or add steps yourself.
                </Text>
                <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
                  <Chip label="Break down with AI" icon="sparkles" selected onPress={() => void handleBreakDown()} />
                  <Chip label="Add subtask" icon="add" onPress={() => setSubtaskSheet(true)} />
                </View>
              </View>
            </Card>
          ) : (
            <View style={{ gap: theme.spacing.sm }}>
              {subtasks.map((subtask) => (
                <TaskCard
                  key={subtask.id}
                  task={subtask}
                  allTasks={tasks}
                  depth={1}
                  onToggle={toggleTask}
                  onPress={(subId) => router.push(`/task/${subId}`)}
                  onDelete={removeTask}
                />
              ))}
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <Chip label="Add subtask" icon="add" onPress={() => setSubtaskSheet(true)} />
                <Chip label="Break down with AI" icon="sparkles" onPress={() => void handleBreakDown()} />
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <TaskEditorSheet task={task} visible={editing} onClose={() => setEditing(false)} />

      <AddSubtaskSheet
        visible={subtaskSheet}
        onClose={() => setSubtaskSheet(false)}
        onSubmit={async (title) => {
          await addTask({ title, parentId: task.id, projectId: task.projectId, priority: task.priority });
          success();
        }}
      />
    </View>
  );
}

function AddSubtaskSheet({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (title: string) => Promise<void>;
}) {
  const theme = useTheme();
  const [title, setTitle] = useState('');
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Add subtask" heightRatio={0.34}>
      <View style={{ gap: theme.spacing.md, paddingTop: theme.spacing.lg }}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Subtask — dates and #tags work here too"
          placeholderTextColor={theme.colors.textTertiary}
          style={[
            theme.typography.body,
            {
              color: theme.colors.textPrimary,
              backgroundColor: theme.colors.surfaceSunken,
              borderRadius: theme.radii.md,
              padding: theme.spacing.md,
            },
          ]}
          autoFocus
        />
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <Chip
            label="Add"
            selected
            onPress={() => {
              if (!title.trim()) return;
              void onSubmit(title.trim()).then(() => {
                setTitle('');
                onClose();
              });
            }}
          />
          <Chip label="Cancel" onPress={onClose} />
        </View>
      </View>
    </BottomSheet>
  );
}

/** Inline play/pause chip for an audio attachment (voice quick-add notes). */
function AudioAttachment({ attachment }: { attachment: Attachment }) {
  const theme = useTheme();
  const player = useAudioPlayer({ uri: attachment.uri });
  const status = useAudioPlayerStatus(player);

  return (
    <Pressable
      onPress={() => {
        try {
          if (status.playing) {
            player.pause();
          } else {
            // Rewind once the note has played out, so pressing play again
            // replays it instead of sitting silently at the end.
            if (status.duration > 0 && status.currentTime >= status.duration) {
              player.seekTo(0);
            }
            player.play();
          }
        } catch {
          // A missing file must never crash the detail screen.
        }
      }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingVertical: 9,
        paddingHorizontal: 12,
        borderRadius: theme.radii.pill,
        backgroundColor: theme.colors.surfaceSunken,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.border,
      }}
    >
      <Ionicons
        name={status.playing ? 'pause-circle' : 'play-circle'}
        size={20}
        color={theme.colors.accent}
      />
      <Text variant="caption" color={theme.colors.textSecondary}>
        {attachment.name ?? 'Voice note'}
      </Text>
      <Text variant="micro" color={theme.colors.textTertiary}>
        {formatClock(status.currentTime)} / {formatClock(status.duration)}
      </Text>
    </Pressable>
  );
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${(total % 60).toString().padStart(2, '0')}`;
}

