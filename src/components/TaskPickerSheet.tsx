import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import type { TaskWithTags } from '@/domain/types';
import { isOpen } from '@/store/selectors';
import { useTheme } from '@/theme/ThemeProvider';
import { selection } from '@/utils/haptics';

import { BottomSheet } from './BottomSheet';
import { Chip, Text } from './ui';

interface TaskPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  tasks: TaskWithTags[];
  projects: { id: string; name: string; color: string }[];
  /** Currently linked task, or null for "nothing". */
  selectedId: string | null;
  onSelect: (taskId: string | null) => void;
}

/**
 * "Working on" picker.
 *
 * The focus timer used to ask which task you were working on with a horizontal
 * strip of truncated pills — unusable past a handful of tasks. This is a proper
 * picker: search, list, and an explicit "nothing" option (picking no task is
 * allowed; the timer just tells you the time is unassigned).
 */
export function TaskPickerSheet({
  visible,
  onClose,
  tasks,
  projects,
  selectedId,
  onSelect,
}: TaskPickerSheetProps) {
  const theme = useTheme();
  const [query, setQuery] = useState('');

  const projectById = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    for (const project of projects) map.set(project.id, project);
    return map;
  }, [projects]);

  const openTasks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tasks
      .filter((task) => isOpen(task))
      .filter((task) => (needle ? task.title.toLowerCase().includes(needle) : true))
      .slice(0, 60);
  }, [query, tasks]);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Working on"
      subtitle="Focus minutes are attributed to this task and its list."
      heightRatio={0.82}
    >
      <View style={{ gap: theme.spacing.md, paddingTop: theme.spacing.lg }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            backgroundColor: theme.colors.surfaceSunken,
            borderRadius: theme.radii.pill,
            paddingHorizontal: theme.spacing.lg,
          }}
        >
          <Ionicons name="search-outline" size={16} color={theme.colors.textTertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search your open tasks"
            placeholderTextColor={theme.colors.textTertiary}
            accessibilityLabel="Search tasks"
            style={[
              theme.typography.body,
              { flex: 1, color: theme.colors.textPrimary, paddingVertical: 12 },
            ]}
          />
        </View>

        <ScrollView
          style={{ maxHeight: 380 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            onPress={() => {
              selection();
              onSelect(null);
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel="No task — leave focus time unassigned"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              paddingVertical: theme.spacing.md,
              paddingHorizontal: theme.spacing.md,
              borderRadius: theme.radii.lg,
              backgroundColor: selectedId === null ? theme.colors.accentSoft : 'transparent',
              minHeight: 48,
            }}
          >
            <Ionicons
              name={selectedId === null ? 'radio-button-on' : 'radio-button-off'}
              size={18}
              color={theme.colors.accent}
            />
            <Text variant="body" color={theme.colors.textSecondary}>
              Nothing — just count the time
            </Text>
          </Pressable>

          {openTasks.map((task) => {
            const project = task.projectId ? projectById.get(task.projectId) : null;
            const active = task.id === selectedId;
            return (
              <Pressable
                key={task.id}
                onPress={() => {
                  selection();
                  onSelect(task.id);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityLabel={`Work on ${task.title}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.md,
                  paddingVertical: theme.spacing.md,
                  paddingHorizontal: theme.spacing.md,
                  borderRadius: theme.radii.lg,
                  backgroundColor: active ? theme.colors.accentSoft : 'transparent',
                  minHeight: 48,
                }}
              >
                <Ionicons
                  name={active ? 'radio-button-on' : 'radio-button-off'}
                  size={18}
                  color={active ? theme.colors.accent : theme.colors.borderStrong}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="body" numberOfLines={1}>
                    {task.title}
                  </Text>
                  {project ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <View
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: project.color,
                        }}
                      />
                      <Text variant="caption" color={theme.colors.textSecondary}>
                        {project.name}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}

          {openTasks.length === 0 ? (
            <View style={{ padding: theme.spacing.lg, alignItems: 'center', gap: 6 }}>
              <Text variant="caption" color={theme.colors.textSecondary}>
                No open tasks match “{query.trim()}”.
              </Text>
              <Text variant="micro" color={theme.colors.textTertiary}>
                YOU CAN STILL START — THE TIME JUST COUNTS AS UNASSIGNED.
              </Text>
            </View>
          ) : null}
        </ScrollView>

        <Chip label="Close" onPress={onClose} accessibilityLabel="Close the task picker" />
      </View>
    </BottomSheet>
  );
}
