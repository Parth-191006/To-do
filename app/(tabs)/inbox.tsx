import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/BottomSheet';
import { TaskCard, isTaskOverdue } from '@/components/TaskCard';
import { TaskEditorSheet } from '@/components/TaskEditorSheet';
import { Chip, EmptyState, Text } from '@/components/ui';
import { findOrCreateTag } from '@/db/repositories/tags';
import type { TaskWithTags } from '@/domain/types';
import { isOpen, sortByUrgency, topLevel } from '@/store/selectors';
import { useStore } from '@/store/useStore';
import { useTheme } from '@/theme/ThemeProvider';
import { selection, success, tapLight } from '@/utils/haptics';

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
  const searchTasks = useStore((state) => state.searchTasks);
  const tags = useStore((state) => state.tags);
  const projects = useStore((state) => state.projects);
  const patchTask = useStore((state) => state.patchTask);
  const refresh = useStore((state) => state.refresh);
  const restoreTask = useStore((state) => state.restoreTask);

  /** Swipe-delete from this screen is undoable — same contract as Today. */
  const [undoId, setUndoId] = useState<string | null>(null);
  const handleSwipeDelete = useCallback(
    (id: string) => {
      void removeTask(id);
      setUndoId(id);
    },
    [removeTask],
  );

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('open');
  const [activeTagId, setActiveTagId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Bulk-selection mode — long lists are unusable one swipe at a time. */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const selecting = selected.size > 0;

  const toggleSelected = useCallback((id: string) => {
    tapLight();
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  /** Sets state explicitly — `toggleTask` would un-complete an already-done row. */
  const bulkComplete = useCallback(async () => {
    for (const id of selected) await patchTask(id, { status: 'done' });
    success();
    clearSelection();
  }, [clearSelection, patchTask, selected]);

  const bulkDelete = useCallback(async () => {
    for (const id of selected) await removeTask(id);
    clearSelection();
  }, [clearSelection, removeTask, selected]);

  const bulkMove = useCallback(
    async (projectId: string | null) => {
      for (const id of selected) await patchTask(id, { projectId });
      setMoveOpen(false);
      clearSelection();
    },
    [clearSelection, patchTask, selected],
  );

  const bulkTag = useCallback(
    async (rawName: string) => {
      const tag = await findOrCreateTag(rawName);
      for (const id of selected) {
        const task = tasks.find((entry) => entry.id === id);
        if (!task) continue;
        await patchTask(id, { tagIds: Array.from(new Set([...task.tagIds, tag.id])) });
      }
      await refresh();
      setTagOpen(false);
      clearSelection();
    },
    [clearSelection, patchTask, refresh, selected, tasks],
  );
  /**
   * Results from the SQLite FTS5 index. Null means "no query" — the list then
   * comes from the store the way every other screen reads it.
   */
  const [matches, setMatches] = useState<TaskWithTags[] | null>(null);

  const needle = query.trim();

  // Debounced so a fast typist does not open a query per character. The index
  // answers with relevance order (bm25), which is why the filtered list below
  // only re-sorts when there is no query.
  useEffect(() => {
    if (!needle) {
      setMatches(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void searchTasks(needle)
        .then((rows) => {
          if (!cancelled) setMatches(rows);
        })
        .catch(() => {
          if (!cancelled) setMatches([]);
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [needle, searchTasks]);

  const filtered = useMemo(() => {
    const lower = needle.toLowerCase();
    // With an active query the FTS result *is* the candidate set; the local
    // substring check is kept for the moment before the first search lands, so
    // the list never flashes everything the user just filtered out.
    const source = needle && matches ? matches : topLevel(tasks);
    const kept = source.filter((task) => {
      if (filter === 'open' && !isOpen(task)) return false;
      if (filter === 'done' && task.status !== 'done') return false;
      if (filter === 'overdue' && !isTaskOverdue(task)) return false;
      if (activeTagId && !task.tagIds.includes(activeTagId)) return false;
      if (needle && !matches && !`${task.title} ${task.notes}`.toLowerCase().includes(lower)) {
        return false;
      }
      return true;
    });
    return needle ? kept : sortByUrgency(kept);
  }, [activeTagId, filter, matches, needle, tasks]);

  const editingTask = useMemo(
    () => tasks.find((task) => task.id === editingId) ?? null,
    [editingId, tasks],
  );

  const handleOpen = useCallback(
    (id: string) => {
      // In selection mode a tap selects instead of navigating — the standard
      // Android behaviour for a multi-select list.
      if (selecting) {
        toggleSelected(id);
        return;
      }
      setEditingId(id);
    },
    [selecting, toggleSelected],
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Text variant="title">Inbox</Text>
          <View style={{ flex: 1 }} />
          <Text variant="caption" color={theme.colors.textSecondary}>
            {selecting ? `${selected.size} selected` : `${filtered.length} shown`}
          </Text>
          {/* Multiselect entry point: a real control, not a hidden gesture. */}
          <Pressable
            onPress={() => (selecting ? clearSelection() : toggleSelected(filtered[0]?.id ?? ''))}
            disabled={filtered.length === 0}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={selecting ? 'Cancel selection' : 'Select multiple tasks'}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              minHeight: 40,
              paddingHorizontal: 12,
              borderRadius: theme.radii.pill,
              backgroundColor: selecting ? theme.colors.accent : theme.colors.surfaceSunken,
              opacity: filtered.length === 0 ? 0.5 : 1,
            }}
          >
            <Ionicons
              name={selecting ? 'close' : 'checkbox-outline'}
              size={14}
              color={selecting ? theme.colors.accentContrast : theme.colors.textSecondary}
            />
            <Text
              variant="caption"
              color={selecting ? theme.colors.accentContrast : theme.colors.textSecondary}
            >
              {selecting ? 'Cancel' : 'Select'}
            </Text>
          </Pressable>
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
              onPress={() => {
                selection();
                setFilter(entry.key);
              }}
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
              <Pressable
                key={tag.id}
                onPress={() => {
                  selection();
                  setActiveTagId(activeTagId === tag.id ? null : tag.id);
                }}
              >
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
            title={query.trim() ? 'No matches' : 'Nothing here'}
            subtitle={
              query.trim()
                ? `Nothing matches “${query.trim()}”. Try another word, or a different filter.`
                : 'Try another filter, or add something from the Today tab.'
            }
            /*
             * "Go to Today" only appears when the Inbox is *genuinely* empty —
             * showing it next to a working filter implied the list itself was
             * the problem, when the filter was.
             */
            action={
              !query.trim() && filter === 'all' && !activeTagId
                ? { label: 'Go to Today', onPress: () => router.push('/') }
                : undefined
            }
          />
        ) : (
          filtered.map((task) => {
            const isSelected = selected.has(task.id);
            return (
              <View key={task.id}>
                <TaskCard
                  task={task}
                  allTasks={tasks}
                  onToggle={selecting ? () => toggleSelected(task.id) : toggleTask}
                  onPress={handleOpen}
                  onDelete={handleSwipeDelete}
                  onBreakDown={(id) => void breakDownTask(id)}
                  selected={isSelected}
                />
                {selecting ? (
                  <Pressable
                    onPress={() => toggleSelected(task.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSelected }}
                    accessibilityLabel={`Select ${task.title}`}
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: 40,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons
                      name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={20}
                      color={isSelected ? theme.colors.accent : theme.colors.borderStrong}
                    />
                  </Pressable>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Bulk action bar — only while something is selected. */}
      {selecting ? (
        <View
          style={{
            position: 'absolute',
            left: theme.spacing.lg,
            right: theme.spacing.lg,
            bottom: insets.bottom + 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            backgroundColor: theme.colors.surfaceElevated,
            borderRadius: theme.radii.pill,
            borderWidth: 1,
            borderColor: theme.colors.border,
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.md,
            shadowColor: theme.colors.shadow,
            shadowOpacity: 0.25,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            elevation: 5,
          }}
        >
          <Chip
            label="Complete"
            icon="checkmark-done-outline"
            accessibilityLabel="Complete the selected tasks"
            onPress={() => void bulkComplete()}
          />
          <Chip
            label="Move"
            icon="folder-outline"
            accessibilityLabel="Move the selected tasks to a list"
            onPress={() => setMoveOpen(true)}
          />
          <Chip
            label="Tag"
            icon="pricetag-outline"
            accessibilityLabel="Tag the selected tasks"
            onPress={() => setTagOpen(true)}
          />
          <Chip
            label="Delete"
            icon="trash-outline"
            color={theme.colors.danger}
            accessibilityLabel="Delete the selected tasks"
            onPress={() => void bulkDelete()}
          />
        </View>
      ) : null}

      <BottomSheet
        visible={moveOpen}
        onClose={() => setMoveOpen(false)}
        title={`Move ${selected.size} task${selected.size === 1 ? '' : 's'}`}
        subtitle="Pick the list they should live in."
        heightRatio={0.6}
      >
        <View style={{ gap: theme.spacing.sm, paddingTop: theme.spacing.lg }}>
          <Chip
            label="Inbox (no list)"
            icon="file-tray-outline"
            accessibilityLabel="Move to the inbox"
            onPress={() => void bulkMove(null)}
          />
          {projects
            .filter((project) => !project.isArchived)
            .map((project) => (
              <Chip
                key={project.id}
                label={project.name}
                color={project.color}
                accessibilityLabel={`Move to ${project.name}`}
                onPress={() => void bulkMove(project.id)}
              />
            ))}
        </View>
      </BottomSheet>

      <BottomSheet
        visible={tagOpen}
        onClose={() => setTagOpen(false)}
        title={`Tag ${selected.size} task${selected.size === 1 ? '' : 's'}`}
        subtitle="Tap a tag, or type a new one."
        heightRatio={0.6}
      >
        <TagPicker
          tags={tags}
          onPick={(name) => void bulkTag(name)}
        />
      </BottomSheet>

      {/* Undo strip for the swipe-delete gesture. */}
      {undoId && !selecting ? (
        <View
          style={{
            position: 'absolute',
            left: theme.spacing.lg,
            right: theme.spacing.lg,
            bottom: insets.bottom + 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            backgroundColor: theme.colors.textPrimary,
            borderRadius: theme.radii.pill,
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.lg,
          }}
        >
          <Text variant="caption" color={theme.colors.textInverse} style={{ flex: 1 }}>
            Task deleted
          </Text>
          <Chip
            label="Undo"
            icon="arrow-undo-outline"
            accessibilityLabel="Restore the deleted task"
            onPress={() => {
              void restoreTask(undoId);
              setUndoId(null);
            }}
          />
        </View>
      ) : null}

      <TaskEditorSheet
        task={editingTask}
        visible={editingTask !== null}
        onClose={() => setEditingId(null)}
      />
    </View>
  );
}

/** Tag list + a free-text field so a new tag can be created while bulk-tagging. */
function TagPicker({
  tags,
  onPick,
}: {
  tags: { id: string; name: string; color: string }[];
  onPick: (name: string) => void;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState('');
  return (
    <View style={{ gap: theme.spacing.md, paddingTop: theme.spacing.lg }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {tags.map((tag) => (
          <Chip
            key={tag.id}
            label={`#${tag.name}`}
            color={tag.color}
            accessibilityLabel={`Add the tag ${tag.name}`}
            onPress={() => onPick(tag.name)}
          />
        ))}
      </View>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder="or a new tag name"
        placeholderTextColor={theme.colors.textTertiary}
        accessibilityLabel="New tag name"
        submitBehavior="submit"
        onSubmitEditing={() => {
          const trimmed = draft.trim();
          if (trimmed) onPick(trimmed);
        }}
        style={[
          theme.typography.body,
          {
            color: theme.colors.textPrimary,
            backgroundColor: theme.colors.surfaceSunken,
            borderRadius: theme.radii.md,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: 12,
          },
        ]}
      />
      <View style={{ flexDirection: 'row' }}>
        <Chip
          label="Add tag"
          icon="add"
          selected
          accessibilityLabel="Add the typed tag"
          onPress={() => {
            const trimmed = draft.trim();
            if (trimmed) onPick(trimmed);
          }}
        />
      </View>
    </View>
  );
}
