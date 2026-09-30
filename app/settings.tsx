import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Divider, Chip, Text } from '@/components/ui';
import { resetDatabase } from '@/db/client';
import {
  cancelAllScheduled,
  ensureNotificationPermissions,
  getPermissionStatus,
  scheduleDailyDigest,
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
  const [busy, setBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
    setPermission(await getPermissionStatus());
    setPending(await pendingChangeCount());
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const handleEnableNotifications = useCallback(async () => {
    await ensureNotificationPermissions();
    await scheduleDailyDigest({ hour: 8, minute: 30 });
    await refreshStatus();
  }, [refreshStatus]);

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
          <Row label="Permission" value={permission} />
          <Row label="Scheduled reminders" value={`${pending} local change(s)`} />
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
            <Chip
              label={permission === 'granted' ? 'Re-register digest' : 'Enable notifications'}
              icon="alarm-outline"
              selected={permission !== 'granted'}
              onPress={() => void handleEnableNotifications()}
            />
          </View>
          <Text variant="micro" color={theme.colors.textTertiary}>
            TASKFLOW POSTS TIME, RECURRING AND LOCATION ALERTS. COMPLETE, SNOOZE 5M / 1H / TOMORROW AND OPEN
            ARE AVAILABLE STRAIGHT FROM THE BANNER.
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
            VERSION 1.0.0 · BUILT WITH EXPO + SQLITE + SUPABASE
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
