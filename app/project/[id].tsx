import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProgressRing } from '@/components/ProgressRing';
import { ProjectSheet } from '@/components/ProjectSheet';
import { TaskCard } from '@/components/TaskCard';
import { TaskEditorSheet } from '@/components/TaskEditorSheet';
import { SmartInput } from '@/components/SmartInput';
import { Card, Chip, EmptyState, Text } from '@/components/ui';
import { listActivity } from '@/db/repositories/activity';
import { listMembers } from '@/db/repositories/projects';
import { childrenOf, isOpen, sortByUrgency } from '@/store/selectors';
import { useStore } from '@/store/useStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { ActivityLog, SharedListMember } from '@/domain/types';

export default function ProjectScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const projects = useStore((state) => state.projects);
  const tasks = useStore((state) => state.tasks);
  const toggleTask = useStore((state) => state.toggleTask);
  const removeTask = useStore((state) => state.removeTask);
  const breakDownTask = useStore((state) => state.breakDownTask);
  const addTaskFromInput = useStore((state) => state.addTaskFromInput);

  const removeProject = useStore((state) => state.removeProject);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [members, setMembers] = useState<SharedListMember[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const project = useMemo(() => projects.find((entry) => entry.id === id) ?? null, [id, projects]);

  const projectTasks = useMemo(
    () => sortByUrgency(tasks.filter((task) => task.projectId === id && task.parentId === null)),
    [id, tasks],
  );

  const openCount = projectTasks.filter(isOpen).length;
  const progress = projectTasks.length === 0 ? 0 : (projectTasks.length - openCount) / projectTasks.length;

  const editingTask = tasks.find((task) => task.id === editingId) ?? null;

  useEffect(() => {
    if (!id) return;
    void listMembers(id)
      .then(setMembers)
      .catch(() => undefined);
    void listActivity('project', id)
      .then(setActivity)
      .catch(() => undefined);
  }, [id, tasks]);

  const handleSubmit = useCallback(
    async (text: string) => {
      await addTaskFromInput(text, { projectId: id });
    },
    [addTaskFromInput, id],
  );

  if (!project) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top + 60 }}>
        <EmptyState icon="folder-open-outline" title="Project not found" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          paddingTop: insets.top + theme.spacing.sm,
          paddingHorizontal: theme.spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={theme.colors.textSecondary} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Chip label="Rename" icon="create-outline" onPress={() => setSheetOpen(true)} />
        <Chip
          label={confirmDelete ? 'Sure?' : 'Delete'}
          icon="trash-outline"
          color={theme.colors.danger}
          onPress={() => {
            if (!confirmDelete) {
              setConfirmDelete(true);
              setTimeout(() => setConfirmDelete(false), 3500);
              return;
            }
            void removeProject(String(id)).then(() => router.back());
          }}
        />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          paddingBottom: insets.bottom + 80,
          gap: theme.spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
            <ProgressRing progress={progress} size={74} strokeWidth={8} color={project.color}>
              <Text variant="bodyStrong">{Math.round(progress * 100)}%</Text>
            </ProgressRing>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: project.color }} />
                <Text variant="title">{project.name}</Text>
              </View>
              <Text variant="caption" color={theme.colors.textSecondary}>
                {openCount} open · {projectTasks.length} total
              </Text>
              {members.length > 0 ? (
                <Text variant="caption" color={theme.colors.textTertiary}>
                  Shared with {members.map((member) => member.displayName).join(', ')}
                </Text>
              ) : null}
            </View>
          </View>
        </Card>

        <SmartInput onSubmit={handleSubmit} placeholder={`Add to ${project.name}…`} />

        <View style={{ gap: theme.spacing.sm }}>
          {projectTasks.length === 0 ? (
            <EmptyState icon="sparkles-outline" title="No tasks yet" subtitle="Add the first one above." />
          ) : (
            projectTasks.map((task) => (
              <View key={task.id} style={{ gap: theme.spacing.sm }}>
                <TaskCard
                  task={task}
                  allTasks={tasks}
                  onToggle={toggleTask}
                  onPress={setEditingId}
                  onDelete={removeTask}
                  onBreakDown={(taskId) => void breakDownTask(taskId)}
                />
                {childrenOf(tasks, task.id).map((subtask) => (
                  <TaskCard
                    key={subtask.id}
                    task={subtask}
                    allTasks={tasks}
                    depth={1}
                    onToggle={toggleTask}
                    onPress={setEditingId}
                    onDelete={removeTask}
                  />
                ))}
              </View>
            ))
          )}
        </View>

        {activity.length > 0 ? (
          <Card>
            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="heading">Activity</Text>
              {activity.slice(0, 8).map((entry) => (
                <View key={entry.id} style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                  <Ionicons name="time-outline" size={13} color={theme.colors.textTertiary} />
                  <Text variant="caption" color={theme.colors.textSecondary} style={{ flex: 1 }}>
                    {entry.summary}
                  </Text>
                  <Text variant="micro" color={theme.colors.textTertiary}>
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        <Card>
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="heading">Collaboration</Text>
            <Text variant="caption" color={theme.colors.textSecondary}>
              {members.length > 0
                ? 'Members can complete and edit tasks in this list. Every change is logged above.'
                : 'Share this list to work on it with a team, family or friends. Changes sync in real time.'}
            </Text>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
              <Chip label="Invite by email" icon="mail-outline" />
              {members.length > 0 ? <Chip label={`${members.length} member(s)`} icon="people-outline" /> : null}
            </View>
          </View>
        </Card>
      </ScrollView>

      <TaskEditorSheet
        task={editingTask}
        visible={editingTask !== null}
        onClose={() => setEditingId(null)}
      />

      <ProjectSheet
        visible={sheetOpen}
        project={project}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  );
}

