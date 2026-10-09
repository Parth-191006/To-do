import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/BrandMark';
import { BottomSheet } from '@/components/BottomSheet';
import { Divider, Chip, Text } from '@/components/ui';
import { resetDatabase } from '@/db/client';
import {
  exportCsv,
  exportJson,
  importFromJsonText,
  localBackupExists,
  previewImport,
  readLocalBackupInfo,
  readLocalBackupText,
  writeLocalBackup,
  type ImportPlan,
} from '@/services/data/export';
import { runWeeklyBackupNow } from '@/services/data/weeklyBackup';
import * as FileSystem from 'expo-file-system/legacy';
import {
  applyDndBypassPreference,
  cancelAllScheduled,
  ensureNotificationPermissions,
  getPermissionStatus,
  scheduleDailyDigest,
  scheduleTaskNotifications,
  sendTestNotification,
} from '@/services/notifications';
import {
  getSessionEmail,
  isSupabaseConfigured,
  signInWithOtp,
  signOut,
  subscribeToAuthChanges,
} from '@/services/supabase/client';
import { pendingChangeCount, runSync } from '@/services/sync/engine';
import { usePreferences } from '@/store/usePreferences';
import { useStore } from '@/store/useStore';
import { useTheme, useThemePreference } from '@/theme/ThemeProvider';
import type { ThemePreference } from '@/theme/ThemeProvider';

const THEME_OPTIONS: { key: ThemePreference; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { key: 'light', label: 'Light', icon: 'sunny-outline' },
  { key: 'dark', label: 'Moon', icon: 'moon-outline' },
];

export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preference, setPreference } = useThemePreference();

  const bootstrap = useStore((state) => state.bootstrap);
  const projects = useStore((state) => state.projects);
  const tasks = useStore((state) => state.tasks);
  const habits = useStore((state) => state.habits);

  const autoStartBreak = usePreferences((state) => state.autoStartBreak);
  const setAutoStartBreak = usePreferences((state) => state.setAutoStartBreak);
  const appLock = usePreferences((state) => state.appLock);
  const setAppLock = usePreferences((state) => state.setAppLock);
  const dndBypass = usePreferences((state) => state.dndBypass);
  const setDndBypass = usePreferences((state) => state.setDndBypass);
  const weeklyBackup = usePreferences((state) => state.weeklyBackup);
  const setWeeklyBackup = usePreferences((state) => state.setWeeklyBackup);
  const lastBackupAt = usePreferences((state) => state.lastBackupAt);
  const setOnboarded = usePreferences((state) => state.setOnboarded);
  const dailyGoalMinutes = usePreferences((state) => state.dailyGoalMinutes);
  const weeklyGoalTasks = usePreferences((state) => state.weeklyGoalTasks);

  const [backup, setBackup] = useState<{ exists: boolean; modifiedAt?: number }>({ exists: false });
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  /** Set once the pasted file has been checked, so the second tap can apply it. */
  const [importPlan, setImportPlan] = useState<ImportPlan | null>(null);
  const [dataNote, setDataNote] = useState<string | null>(null);

  const [permission, setPermission] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');
  const [pending, setPending] = useState(0);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [signInEmail, setSignInEmail] = useState('');
  const [linkSent, setLinkSent] = useState(false);

  /** Tasks that still have a future reminder or due time waiting on the OS. */
  const armed = useMemo(
    () =>
      tasks.filter((task) => {
        if (task.status === 'done' || task.status === 'archived') return false;
        const next = task.remindAt ?? task.dueAt;
        return next !== null && new Date(next).getTime() > Date.now();
      }).length,
    [tasks],
  );

  // Defensive: this feeds the only place the notification controls live, so a
  // failing permission or database probe must never take the section down with
  // it — we just fall back to the neutral state and keep the options visible.
  const refreshStatus = useCallback(async () => {
    const [nextPermission, nextPending] = await Promise.all([
      getPermissionStatus().catch(() => 'undetermined' as const),
      pendingChangeCount().catch(() => 0),
    ]);
    setPermission(nextPermission);
    setPending(nextPending);
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // Sync sign-in state. "Sync now" used to dead-end at "Not signed in" with
  // no way to sign in — this is the missing half of that flow.
  useEffect(() => {
    void getSessionEmail().then(setSessionEmail).catch(() => null);
    return subscribeToAuthChanges(() => {
      void getSessionEmail().then(setSessionEmail).catch(() => null);
    });
  }, []);

  const handleSendSignInLink = useCallback(async () => {
    const email = signInEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setSyncMessage('Enter a valid email address.');
      return;
    }
    const { error } = await signInWithOtp(email);
    if (error) {
      setSyncMessage(`Could not send the sign-in link — ${error}`);
      return;
    }
    setLinkSent(true);
    setSyncMessage('Sign-in link sent — open it on this device to sign in.');
  }, [signInEmail]);

  const handleSignOut = useCallback(async () => {
    await signOut().catch(() => undefined);
    setSessionEmail(null);
    setLinkSent(false);
    setSyncMessage('Signed out on this device.');
  }, []);

  /**
   * Asks only from a clean slate. Once Android has recorded a denial it will no
   * longer show a dialog, so re-requesting looks like a dead button — instead we
   * send the user to the OS screen where the toggle actually lives.
   */
  const handleEnableNotifications = useCallback(async () => {
    if (permission === 'denied') {
      await Linking.openSettings().catch(() => undefined);
      setNotice('Turn on notifications for TaskFlow, then come back and re-arm your reminders.');
      return;
    }
    let granted = false;
    try {
      granted = await ensureNotificationPermissions();
      if (granted) {
        await scheduleDailyDigest({ hour: 8, minute: 30 }).catch(() => undefined);
        setNotice('Notifications enabled — your daily 8:30am digest is armed.');
      } else {
        setNotice('Notification permission was not granted — allow it in system settings.');
      }
    } catch {
      setNotice('Could not set up notifications on this device.');
    }
    await refreshStatus();
  }, [permission, refreshStatus]);

  const handleTestNotification = useCallback(async () => {
    const result = await sendTestNotification().catch(() => ({
      ok: false,
      reason: 'Could not send a test notification on this device.',
    }));
    setNotice(
      result.ok
        ? 'Sending… you should see the banner in about 4 seconds. Lock the screen to be sure.'
        : (result.reason ?? 'Could not send a test notification.'),
    );
    await refreshStatus();
  }, [refreshStatus]);

  /** Re-arms every future reminder through the OS in one shot. */
  const handleRescheduleAll = useCallback(async () => {
    setBusy(true);
    try {
      let count = 0;
      for (const task of tasks) {
        const result = await scheduleTaskNotifications(task).catch(() => ({ scheduled: 0 }));
        count += result.scheduled;
      }
      setNotice(`Re-armed ${count} reminder${count === 1 ? '' : 's'}.`);
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  }, [refreshStatus, tasks]);

  const handleSync = useCallback(async () => {
    setBusy(true);
    try {
      const summary = await runSync();
      setSyncMessage(
        summary.skipped
          ? `Nothing to sync — ${summary.reason}`
          : `Pushed ${summary.pushed}, pulled ${summary.pulled}${summary.errors.length ? `, ${summary.errors.length} error(s)` : ''}`,
      );
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  }, [refreshStatus]);

  const refreshBackupInfo = useCallback(async () => {
    setBackup(await readLocalBackupInfo().catch(() => ({ exists: false })));
  }, []);

  useEffect(() => {
    void refreshBackupInfo();
  }, [refreshBackupInfo]);

  const handleExport = useCallback(
    async (kind: 'json' | 'csv') => {
      setBusy(true);
      try {
        const result = kind === 'json' ? await exportJson() : await exportCsv();
        setDataNote(
          result.ok
            ? result.shared
              ? `Exported (${kind.toUpperCase()}) — pick where to send it.`
              : `Exported to ${result.uri}`
            : (result.reason ?? 'Could not export.'),
        );
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const handleBackupNow = useCallback(async () => {
    setBusy(true);
    try {
      const path = await writeLocalBackup();
      setDataNote(path ? 'Local backup written on this device.' : 'Could not write the backup.');
      await refreshBackupInfo();
    } finally {
      setBusy(false);
    }
  }, [refreshBackupInfo]);

  /**
   * First tap: check the file and say what it would change. Nothing is written
   * yet — an import that turns out to be the backup already on the phone should
   * not look like twelve new tasks about to arrive.
   */
  const handleCheckImport = useCallback(async (text: string) => {
    setBusy(true);
    try {
      const preview = await previewImport(text);
      if (!preview.ok) {
        setImportPlan(null);
        setDataNote(preview.message);
        return;
      }
      setImportPlan(preview.plan);
      setDataNote(preview.message);
    } finally {
      setBusy(false);
    }
  }, []);

  /** Second tap: apply it. Duplicates are ignored by id, so this is safe twice. */
  const handleApplyImport = useCallback(
    async (text: string) => {
      setBusy(true);
      try {
        const result = await importFromJsonText(text);
        setDataNote(result.message);
        if (result.ok) {
          setImportPlan(null);
          setImportOpen(false);
          setImportText('');
          await bootstrap();
        }
      } finally {
        setBusy(false);
      }
    },
    [bootstrap],
  );

  const handleRestoreBackup = useCallback(async () => {
    setBusy(true);
    try {
      if (!(await localBackupExists())) {
        setDataNote('No local backup on this device yet — export one first.');
        return;
      }
      const text = await readLocalBackupText();
      if (!text) {
        setDataNote('Could not read the local backup.');
        return;
      }
      await handleApplyImport(text);
    } catch {
      setDataNote('Could not read the local backup.');
    } finally {
      setBusy(false);
    }
  }, [handleApplyImport]);

  /**
   * Clearing local data now takes a backup first. A single mis-tap used to be
   * unrecoverable; with the snapshot on disk it can be undone from this screen.
   */
  const handleReset = useCallback(async () => {
    setBusy(true);
    try {
      await writeLocalBackup().catch(() => null);
      await cancelAllScheduled();
      await resetDatabase();
      await bootstrap();
      setSyncMessage('Local data cleared — a backup was saved first.');
      await refreshBackupInfo();
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  }, [bootstrap, refreshBackupInfo, refreshStatus]);

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
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close settings"
        >
          <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
        </Pressable>
        <Text variant="title">Settings</Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          paddingBottom: insets.bottom + 60,
          gap: theme.spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Section title="Appearance" icon="color-palette-outline">
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            {THEME_OPTIONS.map((option) => (
              <Chip
                key={option.key}
                label={option.label}
                icon={option.icon}
                selected={preference === option.key}
                onPress={() => setPreference(option.key)}
              />
            ))}
          </View>
        </Section>

        <Section title="Notifications" icon="notifications-outline">
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              backgroundColor:
                permission === 'granted' ? theme.colors.successSoft : theme.colors.warningSoft,
              borderRadius: theme.radii.lg,
              padding: theme.spacing.md,
            }}
          >
            <Ionicons
              name={permission === 'granted' ? 'notifications' : 'notifications-off-outline'}
              size={20}
              color={permission === 'granted' ? theme.colors.success : theme.colors.warning}
            />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">
                {permission === 'granted'
                  ? 'Notifications are on'
                  : permission === 'denied'
                    ? 'Notifications are blocked'
                    : 'Notifications are not set up'}
              </Text>
              <Text variant="caption" color={theme.colors.textSecondary}>
                {permission === 'granted'
                  ? `${armed} reminder${armed === 1 ? '' : 's'} armed for later`
                  : permission === 'denied'
                    ? 'Android is blocking TaskFlow — open system settings to allow them.'
                    : 'Allow them so reminders and focus alarms can reach you.'}
              </Text>
            </View>
          </View>

          <Row label="Scheduled reminders" value={`${armed}`} />
          <Row label="Unsynced changes" value={`${pending}`} />

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
            <Chip
              label={
                permission === 'granted'
                  ? 'Re-register digest'
                  : permission === 'denied'
                    ? 'Open system settings'
                    : 'Enable notifications'
              }
              icon={permission === 'denied' ? 'settings-outline' : 'alarm-outline'}
              selected={permission !== 'granted'}
              onPress={() => void handleEnableNotifications()}
            />
            <Chip
              label="Send a test"
              icon="paper-plane-outline"
              onPress={() => void handleTestNotification()}
            />
            <Chip
              label={busy ? 'Working…' : 'Re-arm all reminders'}
              icon="refresh"
              onPress={() => void handleRescheduleAll()}
            />
          </View>

          {notice ? (
            <Text variant="caption" color={theme.colors.accent}>
              {notice}
            </Text>
          ) : null}

          <ToggleRow
            label="Break through Do Not Disturb"
            caption={
              'Off by default. When on, high and urgent reminders use a separate channel that is allowed to make a sound and wake the screen while Do Not Disturb is on — use it for alerts you must not miss. Android only, and Android still shows the system control for it. Reminders already armed keep their old channel; press “Re-arm all reminders” to move them.'
            }
            value={dndBypass}
            onChange={(next) => {
              setDndBypass(next);
              void applyDndBypassPreference(next);
            }}
          />

          <Text variant="micro" color={theme.colors.textTertiary}>
            TASKFLOW POSTS TIME, RECURRING AND LOCATION ALERTS. COMPLETE, SNOOZE 5M / 1H / TOMORROW AND OPEN
            ARE AVAILABLE STRAIGHT FROM THE BANNER. EACH URGENCY TIER IS ITS OWN CHANNEL — TUNE THEM UNDER
            ANDROID SETTINGS › APPS › TASKFLOW › NOTIFICATIONS. IF A REMINDER ARRIVES A FEW MINUTES LATE,
            ALLOW “ALARMS & REMINDERS” FOR TASKFLOW THERE TOO.
          </Text>
        </Section>

        <Section title="Focus" icon="timer-outline">
          <ToggleRow
            label="Auto-start breaks"
            caption="When a focus block reaches zero, the break countdown starts right away instead of waiting for you to press start."
            value={autoStartBreak}
            onChange={setAutoStartBreak}
          />
          <Row label="Daily focus goal" value={`${dailyGoalMinutes} min`} />
          <Row
            label="Weekly task goal"
            value={weeklyGoalTasks === 0 ? 'not set' : `${weeklyGoalTasks} tasks`}
          />
          <Text variant="caption" color={theme.colors.textSecondary}>
            Change the daily goal, the long-break cycle and a custom focus or break length from the
            Focus tab: tap “Custom”.
          </Text>
          <Text variant="micro" color={theme.colors.textTertiary}>
            THE BREAK KEEPS TIME AGAINST THE WALL CLOCK — LOCK THE SCREEN OR LEAVE THE APP AND IT STILL
            COUNTS DOWN AND FIRES THE END ALERT.
          </Text>
        </Section>

        <Section title="Sync" icon="cloud-outline">
          <Row label="Backend" value={isSupabaseConfigured ? 'Supabase connected' : 'Local only'} />
          <Row label="Pending changes" value={`${pending}`} />
          {syncMessage ? (
            <Text variant="caption" color={theme.colors.textSecondary}>
              {syncMessage}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Chip label={busy ? 'Working…' : 'Sync now'} icon="refresh" onPress={() => void handleSync()} />
          </View>

          {isSupabaseConfigured ? (
            sessionEmail ? (
              <>
                <Row label="Signed in as" value={sessionEmail} />
                <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                  <Chip label="Sign out" icon="log-out-outline" onPress={() => void handleSignOut()} />
                </View>
              </>
            ) : (
              <View style={{ gap: theme.spacing.sm }}>
                <TextInput
                  value={signInEmail}
                  onChangeText={setSignInEmail}
                  accessibilityLabel="Email address"
                  placeholder="you@example.com"
                  placeholderTextColor={theme.colors.textTertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  submitBehavior="submit"
                  onSubmitEditing={() => void handleSendSignInLink()}
                  style={[
                    theme.typography.body,
                    {
                      color: theme.colors.textPrimary,
                      backgroundColor: theme.colors.surfaceSunken,
                      borderRadius: theme.radii.md,
                      paddingHorizontal: theme.spacing.md,
                      paddingVertical: 10,
                    },
                  ]}
                />
                <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                  <Chip
                    label={linkSent ? 'Link sent — check your inbox' : 'Send sign-in link'}
                    icon="mail-outline"
                    onPress={() => void handleSendSignInLink()}
                  />
                </View>
              </View>
            )
          ) : null}
          {!isSupabaseConfigured ? (
            <Text variant="micro" color={theme.colors.textTertiary}>
              SET EXPO_PUBLIC_SUPABASE_URL AND EXPO_PUBLIC_SUPABASE_ANON_KEY TO ENABLE CLOUD SYNC AND SHARED
              LISTS. THE APP IS FULLY FUNCTIONAL OFFLINE WITHOUT THEM.
            </Text>
          ) : null}
        </Section>

        <Section title="Security" icon="lock-closed-outline">
          <ToggleRow
            label="App lock"
            caption="Ask for your fingerprint, face or device PIN when TaskFlow opens (and again after 30 seconds away). Uses the screen lock already on this phone — no TaskFlow password to remember."
            value={appLock}
            onChange={setAppLock}
          />
        </Section>

        <Section title="Your data" icon="server-outline">
          <Row label="Projects" value={`${projects.length}`} />
          <Row label="Tasks" value={`${tasks.length}`} />
          <Row label="Habits" value={`${habits.length}`} />
          <Row
            label="Local backup"
            value={
              backup.exists && backup.modifiedAt
                ? new Date(backup.modifiedAt).toLocaleString()
                : 'none yet'
            }
          />

          <ToggleRow
            label="Weekly automatic backup"
            caption={
              'Off by default. When TaskFlow opens and a week has passed, it writes a dated JSON copy into the app’s own backup folder and keeps the last four — so a bad week never overwrites a good copy. A copy written silently into your phone’s shared storage is not possible without a heavier dependency, so use Export JSON when you want the file somewhere else.'
            }
            value={weeklyBackup}
            onChange={(next) => {
              setWeeklyBackup(next);
              if (next) void runWeeklyBackupNow();
            }}
          />
          <Row
            label="Last automatic backup"
            value={lastBackupAt ? new Date(lastBackupAt).toLocaleString() : 'never'}
          />

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
            <Chip
              label="Export JSON"
              icon="download-outline"
              accessibilityLabel="Export every task, habit and list as JSON"
              onPress={() => void handleExport('json')}
            />
            <Chip
              label="Export CSV"
              icon="grid-outline"
              accessibilityLabel="Export tasks as CSV"
              onPress={() => void handleExport('csv')}
            />
            <Chip
              label="Import"
              icon="push-outline"
              accessibilityLabel="Import from a TaskFlow backup"
              onPress={() => {
                setDataNote(null);
                setImportOpen(true);
              }}
            />
            <Chip
              label={busy ? 'Working…' : 'Back up now'}
              icon="save-outline"
              accessibilityLabel="Write a local backup now"
              onPress={() => void handleBackupNow()}
            />
            <Chip
              label="Restore backup"
              icon="refresh-outline"
              accessibilityLabel="Restore the last local backup"
              onPress={() => void handleRestoreBackup()}
            />
          </View>

          {dataNote ? (
            <Text variant="caption" color={theme.colors.accent}>
              {dataNote}
            </Text>
          ) : null}

          <Text variant="caption" color={theme.colors.textSecondary}>
            Privacy: everything you type lives in a SQLite database inside this app — tasks, notes,
            habits, focus sessions, notification bookkeeping and your attached photos and voice notes.
            Nothing is uploaded while you stay local; the only network calls this build can make are
            the optional Supabase sync (only with your own credentials and after you sign in) and an
            AI transcription or breakdown endpoint if you configured one. Backups written here are
            files on this device, shared only when you choose a destination.
          </Text>

          <Text variant="micro" color={theme.colors.textTertiary}>
            EXPORTS CARRY EVERY TASK, LIST, TAG AND HABIT (JSON) OR ONE ROW PER TASK (CSV). CLEARING
            LOCAL DATA WRITES A BACKUP FIRST, SO IT CAN BE UNDONE.
          </Text>
          <Chip
            label="Reset local data"
            icon="trash-outline"
            color={theme.colors.danger}
            accessibilityLabel="Clear all local data"
            onPress={() => void handleReset()}
          />
        </Section>

        <Section title="TaskFlow" icon="information-circle-outline">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <BrandMark size={52} />
            <View style={{ flex: 1 }}>
              <Text variant="heading">TaskFlow</Text>
              <Text variant="caption" color={theme.colors.textSecondary}>
                Capture, focus, finish.
              </Text>
            </View>
          </View>
          <Text variant="caption" color={theme.colors.textSecondary}>
            Every feature ships unlocked: unlimited projects and subtasks, AI breakdown, location reminders,
            actionable snooze, focus timer, habit analytics and themes. No paywall, no tiers.
          </Text>
          <Chip
            label="Show the tour again"
            icon="school-outline"
            accessibilityLabel="Replay the first-run overview"
            onPress={() => {
              // The overlay lives in the root layout, so turning the flag off is
              // all it takes for the tour to be back over this screen.
              setOnboarded(false);
            }}
          />
          <Divider />
          <Text variant="micro" color={theme.colors.textTertiary}>
            VERSION {Constants.expoConfig?.version ?? '—'} · BUILT WITH EXPO + SQLITE + SUPABASE
          </Text>
        </Section>
      </ScrollView>

      {/*
        Import is a paste box rather than a file picker: the JSON export is
        plain text, and this keeps the flow offline and dependency-free.
      */}
      <BottomSheet
        visible={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import TaskFlow data"
        subtitle="Paste a backup file, check what it would add, then apply it. Items already on this device are kept as they are."
        heightRatio={0.7}
      >
        <View style={{ gap: theme.spacing.md, paddingTop: theme.spacing.lg }}>
          <TextInput
            value={importText}
            onChangeText={(next) => {
              setImportText(next);
              // The pasted file changed, so any plan from the previous one is
              // about a different file — drop it rather than applying it.
              setImportPlan(null);
            }}
            multiline
            placeholder='{"version":1,"tasks":[…]}'
            placeholderTextColor={theme.colors.textTertiary}
            accessibilityLabel="Paste backup JSON"
            style={[
              theme.typography.caption,
              {
                color: theme.colors.textPrimary,
                backgroundColor: theme.colors.surfaceSunken,
                borderRadius: theme.radii.md,
                padding: theme.spacing.md,
                minHeight: 160,
                textAlignVertical: 'top',
              },
            ]}
          />
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
            <Chip
              label={busy ? 'Working…' : 'Check the file'}
              icon="search-outline"
              selected={importPlan === null}
              accessibilityLabel="Check the pasted file"
              onPress={() => void handleCheckImport(importText)}
            />
            {importPlan && importPlan.totalNew > 0 ? (
              <Chip
                label={busy ? 'Importing…' : `Add ${importPlan.totalNew} item${importPlan.totalNew === 1 ? '' : 's'}`}
                icon="push-outline"
                selected
                accessibilityLabel="Import the pasted data"
                onPress={() => void handleApplyImport(importText)}
              />
            ) : null}
            <Chip
              label="Cancel"
              accessibilityLabel="Cancel the import"
              onPress={() => {
                setImportOpen(false);
                setImportPlan(null);
                setDataNote(null);
              }}
            />
          </View>
          {dataNote ? (
            <Text variant="caption" color={theme.colors.textSecondary}>
              {dataNote}
            </Text>
          ) : null}
        </View>
      </BottomSheet>
    </View>
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
    <View style={{ gap: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name={icon} size={15} color={theme.colors.accent} />
        <Text variant="label">{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: theme.spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.border,
      }}
    >
      <Text variant="body" color={theme.colors.textSecondary} style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="caption">{value}</Text>
    </View>
  );
}

function ToggleRow({
  label,
  caption,
  value,
  onChange,
}: {
  label: string;
  caption: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.border,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body">{label}</Text>
        <Text variant="caption" color={theme.colors.textSecondary}>
          {caption}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: theme.colors.borderStrong, true: theme.colors.accent }}
        thumbColor={value ? theme.colors.accentContrast : theme.colors.surface}
        ios_backgroundColor={theme.colors.borderStrong}
        accessibilityLabel={label}
      />
    </View>
  );
}
