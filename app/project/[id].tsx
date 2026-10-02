import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/BottomSheet';
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
import {
  isSupabaseConfigured,
  subscribeToProjectChanges,
} from '@/services/supabase/client';
import type { ActivityLog, Attachment, SharedListMember } from '@/domain/types';

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
  const patchTask = useStore((state) => state.patchTask);
  const refreshTasks = useStore((state) => state.refreshTasks);

  const removeProject = useStore((state) => state.removeProject);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [members, setMembers] = useState<SharedListMember[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteNote, setInviteNote] = useState<string | null>(null);

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

  // Live collaboration: other members' writes land in Postgres and are streamed
  // back, so an open list updates without a pull-to-refresh. The helper is a
  // no-op when no backend is configured.
  useEffect(() => {
    if (!id || !isSupabaseConfigured) return;
    return subscribeToProjectChanges(String(id), () => {
      void refreshTasks();
    });
  }, [id, refreshTasks]);

  const handleSubmit = useCallback(
    async (text: string, attachments: Attachment[] = []) => {
      const created = await addTaskFromInput(text, { projectId: id });
      // Attachments used to be dropped on this screen — the input offered the
      // mic and photo buttons, then `onSubmit` only forwarded the text.
      if (created && attachments.length > 0) {
        await patchTask(created.id, { attachments });
      }
    },
    [addTaskFromInput, id, patchTask],
  );

  /**
   * "Invite by email" used to be a Chip with no `onPress` — a visibly dead
   * button. It now opens a real email draft (or the OS share sheet when no
   * mail app can handle `mailto:`), carrying the list name and the download
   * link so the invite actually reaches someone.
   */
  const handleInvite = useCallback(async () => {
    const email = inviteEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInviteNote('Enter a valid email address.');
      return;
    }

    const listName = project?.name ?? 'my list';
    const subject = `Invitation to collaborate on “${listName}” in TaskFlow`;
    const body = [
      'Hi,',
      '',
      `I’d like to share the “${listName}” list from TaskFlow with you.`,
      '',
      'Get TaskFlow (Android):',
      'https://github.com/Parth-191006/To-do/releases/latest/download/TaskFlow-latest.apk',
      '',
      isSupabaseConfigured
        ? 'Once it is installed, open Settings › Sync and sign in with this email so our lists replicate.'
        : 'Once it is installed we can connect a shared backend (Settings › Sync) so our lists replicate.',
      '',
      '— sent from TaskFlow',
    ].join('\n');

    const url = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        setInviteNote('Opening your email app…');
        return;
      }
    } catch {
      // Fall through to the share sheet.
    }
    try {
      const result = await Share.share({ message: `${subject}\n\n${body}` });
      setInviteNote(
        result.action === Share.sharedAction ? 'Invite shared.' : 'Invite dismissed.',
      );
    } catch {
      setInviteNote('Could not open an email or share app on this device.');
    }
  }, [inviteEmail, project?.name]);

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

        <SmartInput onSubmit={handleSubmit} label={`Add to ${project.name}`} />

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
                : isSupabaseConfigured
                  ? 'Share this list to work on it with a team, family or friends. Changes sync in real time.'
                  : 'Invite someone by email to plan together. Real-time sync switches on when this build is connected to a Supabase backend (Settings › Sync).'}
            </Text>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
              <Chip
                label="Invite by email"
                icon="mail-outline"
                onPress={() => {
                  setInviteNote(null);
                  setInviteOpen(true);
                }}
              />
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

      <BottomSheet
        visible={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          setInviteNote(null);
        }}
        title="Invite to this list"
        subtitle="Opens a ready-made email draft in your own mail app."
        heightRatio={0.62}
      >
        <View style={{ gap: theme.spacing.md, paddingTop: theme.spacing.lg }}>
          <TextInput
            value={inviteEmail}
            onChangeText={setInviteEmail}
            placeholder="teammate@example.com"
            placeholderTextColor={theme.colors.textTertiary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            submitBehavior="submit"
            onSubmitEditing={() => void handleInvite()}
            style={[
              theme.typography.body,
              {
                color: theme.colors.textPrimary,
                backgroundColor: theme.colors.surfaceSunken,
                borderRadius: theme.radii.md,
                padding: theme.spacing.md,
              },
            ]}
          />

          {inviteNote ? (
            <Text variant="caption" color={theme.colors.accent}>
              {inviteNote}
            </Text>
          ) : null}

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Chip
              label="Open email draft"
              icon="mail-outline"
              selected
              onPress={() => void handleInvite()}
            />
            <Chip
              label="Cancel"
              onPress={() => {
                setInviteOpen(false);
                setInviteNote(null);
              }}
            />
          </View>

          <Text variant="micro" color={theme.colors.textTertiary}>
            {isSupabaseConfigured
              ? 'BOTH SIDES SIGN IN UNDER SETTINGS › SYNC FOR THE LIST TO REPLICATE LIVE.'
              : 'CLOUD REPLICATION IS OFF ON THIS BUILD — THE INVITE CARRIES THE DOWNLOAD LINK SO THEY CAN INSTALL TASKFLOW.'}
          </Text>
        </View>
      </BottomSheet>
    </View>
  );
}

