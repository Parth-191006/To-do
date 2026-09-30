import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Divider, Chip, Text } from '@/components/ui';
import { resetDatabase } from '@/db/client';
import {
  cancelAllScheduled,
  ensureNotificationPermissions,
  getPermissionStatus,
  scheduleDailyDigest,
  scheduleTaskNotifications,
  sendTestNotification,
} from '@/services/notifications';
import { isSupabaseConfigured } from '@/services/supabase/client';
import { pendingChangeCount, runSync } from '@/services/sync/engine';
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

  const [permission, setPermission] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');
  const [pending, setPending] = useState(0);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const refreshStatus = useCallback(async () => {
    setPermission(await getPermissionStatus());
    setPending(await pendingChangeCount());
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

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
    const granted = await ensureNotificationPermissions();
    if (granted) {
      await scheduleDailyDigest({ hour: 8, minute: 30 });
      setNotice('Notifications enabled — your daily 8:30am digest is armed.');
    } else {
      setNotice('Notification permission was not granted.');
    }
    await refreshStatus();
  }, [permission, refreshStatus]);

  const handleTestNotification = useCallback(async () => {
    const result = await sendTestNotification();
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

  const handleReset = useCallback(async () => {
    setBusy(true);
    try {
      await cancelAllScheduled();
      await resetDatabase();
      await bootstrap();
      setSyncMessage('Local data cleared.');
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  }, [bootstrap, refreshStatus]);

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
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Close settings">
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

          <Text variant="micro" color={theme.colors.textTertiary}>
            TASKFLOW POSTS TIME, RECURRING AND LOCATION ALERTS. COMPLETE, SNOOZE 5M / 1H / TOMORROW AND OPEN
            ARE AVAILABLE STRAIGHT FROM THE BANNER. URGENT TASKS USE A HIGH-PRIORITY CHANNEL — TUNE
            EACH ONE UNDER ANDROID SETTINGS › APPS › TASKFLOW › NOTIFICATIONS.
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
          {!isSupabaseConfigured ? (
            <Text variant="micro" color={theme.colors.textTertiary}>
              SET EXPO_PUBLIC_SUPABASE_URL AND EXPO_PUBLIC_SUPABASE_ANON_KEY TO ENABLE CLOUD SYNC AND SHARED
              LISTS. THE APP IS FULLY FUNCTIONAL OFFLINE WITHOUT THEM.
            </Text>
          ) : null}
        </Section>

        <Section title="Your data" icon="server-outline">
          <Row label="Projects" value={`${projects.length}`} />
          <Row label="Tasks" value={`${tasks.length}`} />
          <Row label="Habits" value={`${habits.length}`} />
          <Text variant="micro" color={theme.colors.textTertiary}>
            STORED LOCALLY IN SQLITE — INSTANT AND OFFLINE-FIRST. NOTHING LEAVES THE DEVICE UNLESS YOU
            CONNECT A BACKEND.
          </Text>
          <Chip label="Reset local data" icon="trash-outline" color={theme.colors.danger} onPress={() => void handleReset()} />
        </Section>

        <Section title="TaskFlow" icon="information-circle-outline">
          <Text variant="caption" color={theme.colors.textSecondary}>
            Every feature ships unlocked: unlimited projects and subtasks, AI breakdown, location reminders,
            actionable snooze, focus timer, habit analytics and themes. No paywall, no tiers.
          </Text>
          <Divider />
          <Text variant="micro" color={theme.colors.textTertiary}>
            VERSION {Constants.expoConfig?.version ?? '—'} · BUILT WITH EXPO + SQLITE + SUPABASE
          </Text>
        </Section>
      </ScrollView>
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
