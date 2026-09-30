import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import type { Priority, Recurrence, TaskWithTags } from '@/domain/types';
import { findOrCreateTag } from '@/db/repositories/tags';
import { reverseGeocode } from '@/services/notifications/geofence';
import { useStore } from '@/store/useStore';
import { useTheme } from '@/theme/ThemeProvider';
import { selection, success, warning } from '@/utils/haptics';

import { BottomSheet } from './BottomSheet';
import { Chip, Divider, Text } from './ui';

const PRIORITIES: Priority[] = ['none', 'low', 'medium', 'high', 'urgent'];

const PRIORITY_LABEL: Record<Priority, string> = {
  none: 'None',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

interface TaskEditorSheetProps {
  task: TaskWithTags | null;
  visible: boolean;
  onClose: () => void;
}

function atHour(dayOffset: number, hour: number, minute = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

/**
 * Everything about a task is editable without leaving the flow: title, notes,
 * when, how urgent, which list, whether it repeats, and whether it should
 * remind you by place rather than time.
 */
export function TaskEditorSheet({ task, visible, onClose }: TaskEditorSheetProps) {
  const theme = useTheme();
  const projects = useStore((s) => s.projects);
  const tags = useStore((s) => s.tags);
  const patchTask = useStore((s) => s.patchTask);
  const removeTask = useStore((s) => s.removeTask);
  const refresh = useStore((s) => s.refresh);

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setNotes(task.notes);
    setTagDraft('');
  }, [task]);

  const dueLabel = useMemo(() => {
    if (!task?.dueAt) return 'No date';
    return new Date(task.dueAt).toLocaleString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  }, [task?.dueAt]);

  const commit = useCallback(
    async (patch: Parameters<typeof patchTask>[1]) => {
      if (!task) return;
      await patchTask(task.id, patch);
    },
    [patchTask, task],
  );

  const addTag = useCallback(async () => {
    if (!task || !tagDraft.trim()) return;
    const tag = await findOrCreateTag(tagDraft);
    await commit({ tagIds: Array.from(new Set([...task.tagIds, tag.id])) });
    await refresh();
    setTagDraft('');
    selection();
  }, [commit, refresh, tagDraft, task]);

  const addLocationReminder = useCallback(async () => {
    if (!task) return;
    setBusy(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        warning();
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const label = await reverseGeocode(position.coords.latitude, position.coords.longitude);
      await commit({
        locationReminder: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          radius: 150,
          trigger: 'enter',
          label,
        },
      });
      success();
    } finally {
      setBusy(false);
    }
  }, [commit, task]);

  const applyRecurrence = useCallback(
    (recurrence: Recurrence | null) => {
      selection();
      void commit({ recurrence });
    },
    [commit],
  );

  if (!task) return null;

  const todayIso = new Date().toDateString();

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Edit task" subtitle={dueLabel} heightRatio={0.9}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.lg, paddingTop: theme.spacing.lg }}>
        {/* Title + notes */}
        <TextInput
          value={title}
          onChangeText={setTitle}
          onBlur={() => title.trim() && title !== task.title && void commit({ title: title.trim() })}
          style={[
            theme.typography.heading,
            {
              color: theme.colors.textPrimary,
              backgroundColor: theme.colors.surfaceSunken,
              borderRadius: theme.radii.md,
              padding: theme.spacing.md,
            },
          ]}
          placeholder="Task title"
          placeholderTextColor={theme.colors.textTertiary}
        />

        <TextInput
          value={notes}
          onChangeText={setNotes}
          onBlur={() => notes !== task.notes && void commit({ notes })}
          multiline
          style={[
            theme.typography.body,
            {
              color: theme.colors.textPrimary,
              backgroundColor: theme.colors.surfaceSunken,
              borderRadius: theme.radii.md,
              padding: theme.spacing.md,
              minHeight: 78,
            },
          ]}
          placeholder="Notes"
          placeholderTextColor={theme.colors.textTertiary}
        />

        {/* When */}
        <Section title="When" icon="calendar-outline">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Chip label="Today 9am" onPress={() => void commit({ dueAt: atHour(0, 9), remindAt: atHour(0, 8, 45) })} />
            <Chip label="Today 5pm" onPress={() => void commit({ dueAt: atHour(0, 17), remindAt: atHour(0, 16, 45) })} />
            <Chip label="Tomorrow 9am" onPress={() => void commit({ dueAt: atHour(1, 9), remindAt: atHour(1, 8, 45) })} />
            <Chip label="Next week" onPress={() => void commit({ dueAt: atHour(7, 9), remindAt: atHour(7, 8, 45) })} />
            <Chip label="Clear" onPress={() => void commit({ dueAt: null, remindAt: null })} />
          </ScrollView>
          {task.dueAt && new Date(task.dueAt).toDateString() === todayIso ? (
            <Text variant="micro" color={theme.colors.textTertiary}>
              DUE TODAY
            </Text>
          ) : null}
        </Section>

        {/* Priority */}
        <Section title="Priority" icon="flag-outline">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {PRIORITIES.map((priority) => (
              <Chip
                key={priority}
                label={PRIORITY_LABEL[priority]}
                selected={task.priority === priority}
                color={theme.colors.priority[priority]}
                onPress={() => {
                  selection();
                  void commit({ priority });
                }}
              />
            ))}
          </View>
        </Section>

        {/* Repeat */}
        <Section title="Repeat" icon="repeat-outline">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip
              label="Never"
              selected={task.recurrence === null}
              onPress={() => applyRecurrence(null)}
            />
            <Chip
              label="Daily"
              selected={task.recurrence?.frequency === 'daily'}
              onPress={() => applyRecurrence({ frequency: 'daily', interval: 1 })}
            />
            <Chip
              label="Weekly"
              selected={task.recurrence?.frequency === 'weekly'}
              onPress={() => applyRecurrence({ frequency: 'weekly', interval: 1 })}
            />
            <Chip
              label="Monthly"
              selected={task.recurrence?.frequency === 'monthly'}
              onPress={() => applyRecurrence({ frequency: 'monthly', interval: 1 })}
            />
            <Chip
              label="Yearly"
              selected={task.recurrence?.frequency === 'yearly'}
              onPress={() => applyRecurrence({ frequency: 'yearly', interval: 1 })}
            />
          </View>
        </Section>

        {/* Project */}
        <Section title="List" icon="folder-outline">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip
              label="Inbox"
              selected={task.projectId === null}
              onPress={() => void commit({ projectId: null })}
            />
            {projects
              .filter((project) => !project.isArchived)
              .map((project) => (
                <Chip
                  key={project.id}
                  label={project.name}
                  color={project.color}
                  selected={task.projectId === project.id}
                  onPress={() => void commit({ projectId: project.id })}
                />
              ))}
          </View>
        </Section>

        {/* Tags */}
        <Section title="Tags" icon="pricetag-outline">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {task.tagIds.map((tagId) => {
              const tag = tags.find((entry) => entry.id === tagId);
              return (
                <Chip
                  key={tagId}
                  label={tag ? `#${tag.name}` : '#tag'}
                  color={tag?.color}
                  selected
                  onPress={() =>
                    void commit({ tagIds: task.tagIds.filter((id) => id !== tagId) })
                  }
                />
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <TextInput
              value={tagDraft}
              onChangeText={setTagDraft}
              onSubmitEditing={() => void addTag()}
              placeholder="Add a tag"
              placeholderTextColor={theme.colors.textTertiary}
              style={[
                theme.typography.body,
                {
                  flex: 1,
                  color: theme.colors.textPrimary,
                  backgroundColor: theme.colors.surfaceSunken,
                  borderRadius: theme.radii.md,
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: 10,
                },
              ]}
            />
            <Chip label="Add" icon="add" onPress={() => void addTag()} />
          </View>
        </Section>

        {/* Location reminder */}
        <Section title="Place reminder" icon="location-outline">
          {task.locationReminder ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <Chip
                label={`${task.locationReminder.label} · on ${task.locationReminder.trigger}`}
                icon="location"
                selected
              />
              <Pressable onPress={() => void commit({ locationReminder: null })} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={theme.colors.textTertiary} />
              </Pressable>
            </View>
          ) : (
            <Chip
              label={busy ? 'Locating…' : 'Remind me at my current location'}
              icon="navigate-outline"
              onPress={() => void addLocationReminder()}
            />
          )}
        </Section>

        <Divider />

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <Chip
            label="Delete task"
            icon="trash-outline"
            color={theme.colors.danger}
            onPress={() => {
              void removeTask(task.id).then(onClose);
            }}
          />
          <View style={{ flex: 1 }} />
          <Chip label="Done" selected onPress={onClose} />
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name={icon} size={14} color={theme.colors.textSecondary} />
        <Text variant="label" color={theme.colors.textSecondary}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

