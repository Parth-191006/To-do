import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TaskCard, isTaskOverdue } from '@/components/TaskCard';
import { TaskEditorSheet } from '@/components/TaskEditorSheet';
import { EmptyState, Text } from '@/components/ui';
import { isOpen, sortByUrgency, topLevel } from '@/store/selectors';
import { useStore } from '@/store/useStore';
import { useTheme } from '@/theme/ThemeProvider';

type Filter = 'all' | 'open' | 'overdue' | 'done';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'done', label: 'Done' },
];

export default function InboxScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const tasks = useStore((state) => state.tasks);
  const toggleTask = useStore((state) => state.toggleTask);
  const removeTask = useStore((state) => state.removeTask);
  const breakDownTask = useStore((state) => state.breakDownTask);
  const tags = useStore((state) => state.tags);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('open');
  const [activeTagId, setActiveTagId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sortByUrgency(
      topLevel(tasks).filter((task) => {
        if (filter === 'open' && !isOpen(task)) return false;
        if (filter === 'done' && task.status !== 'done') return false;
        if (filter === 'overdue' && !isTaskOverdue(task)) return false;
        if (activeTagId && !task.tagIds.includes(activeTagId)) return false;
        if (needle && !`${task.title} ${task.notes}`.toLowerCase().includes(needle)) return false;
        return true;
      }),
    );
  }, [activeTagId, filter, query, tasks]);

  const editingTask = useMemo(
    () => tasks.find((task) => task.id === editingId) ?? null,
    [editingId, tasks],
  );

  const handleOpen = useCallback((id: string) => setEditingId(id), []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text variant="title">Inbox</Text>
          <View style={{ flex: 1 }} />
          <Text variant="caption" color={theme.colors.textSecondary}>
            {filtered.length} shown
          </Text>
        </View>

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
            placeholder="Search tasks and notes"
            placeholderTextColor={theme.colors.textTertiary}
            style={[theme.typography.body, { flex: 1, color: theme.colors.textPrimary, paddingVertical: 11 }]}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={theme.colors.textTertiary} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.sm }}>
          {FILTERS.map((entry) => (
            <Pressable
              key={entry.key}
              onPress={() => setFilter(entry.key)}
              style={{
                paddingVertical: 7,
                paddingHorizontal: 14,
                borderRadius: theme.radii.pill,
                backgroundColor: filter === entry.key ? theme.colors.accent : theme.colors.surface,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: filter === entry.key ? theme.colors.accent : theme.colors.border,
              }}
            >
              <Text
                variant="caption"
                color={filter === entry.key ? theme.colors.accentContrast : theme.colors.textSecondary}
              >
                {entry.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {tags.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.sm }}>
            {tags.map((tag) => (
              <Pressable key={tag.id} onPress={() => setActiveTagId(activeTagId === tag.id ? null : tag.id)}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingVertical: 5,
                    paddingHorizontal: 11,
                    borderRadius: theme.radii.pill,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: activeTagId === tag.id ? tag.color : theme.colors.border,
                    backgroundColor: theme.colors.surface,
                  }}
                >
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tag.color }} />
                  <Text variant="caption" color={theme.colors.textSecondary}>
                    {tag.name}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: insets.bottom + 110,
          gap: theme.spacing.sm,
        }}
        showsVerticalScrollIndicator={false}
      >
        {filtered.length === 0 ? (
          <EmptyState
            icon="file-tray-outline"
            title="Nothing here"
            subtitle="Try another filter, or add something from the Today tab."
            action={{ label: 'Go to Today', onPress: () => router.push('/') }}
          />
        ) : (
          filtered.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              allTasks={tasks}
              onToggle={toggleTask}
              onPress={handleOpen}
              onDelete={removeTask}
              onBreakDown={(id) => void breakDownTask(id)}
            />
          ))
        )}
      </ScrollView>

      <TaskEditorSheet
        task={editingTask}
        visible={editingTask !== null}
        onClose={() => setEditingId(null)}
      />
    </View>
  );
}
