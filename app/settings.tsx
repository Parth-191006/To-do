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
import { t, tPlural, type StringKey } from '@/i18n';
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

const THEME_OPTIONS: { key: ThemePreference; label: StringKey; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'system', label: 'settings.themeSystem', icon: 'phone-portrait-outline' },
  { key: 'light', label: 'settings.themeLight', icon: 'sunny-outline' },
  { key: 'dark', label: 'settings.themeMoon', icon: 'moon-outline' },
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
      setSyncMessage(t('settings.msgValidEmail'));
      return;
    }
    const { error } = await signInWithOtp(email);
    if (error) {
      setSyncMessage(t('settings.msgSignInFailed', { error: String(error) }));
      return;
    }
    setLinkSent(true);
    setSyncMessage(t('settings.msgSignInSent'));
  }, [signInEmail]);

  const handleSignOut = useCallback(async () => {
    await signOut().catch(() => undefined);
    setSessionEmail(null);
    setLinkSent(false);
    setSyncMessage(t('settings.msgSignedOut'));
  }, []);

  /**
   * Asks only from a clean slate. Once Android has recorded a denial it will no
   * longer show a dialog, so re-requesting looks like a dead button — instead we
   * send the user to the OS screen where the toggle actually lives.
   */
  const handleEnableNotifications = useCallback(async () => {
    if (permission === 'denied') {
      await Linking.openSettings().catch(() => undefined);
      setNotice(t('settings.msgOpenSystemSettings'));
      return;
    }
    let granted = false;
    try {
      granted = await ensureNotificationPermissions();
      if (granted) {
        await scheduleDailyDigest({ hour: 8, minute: 30 }).catch(() => undefined);
        setNotice(t('settings.msgNotificationsEnabled'));
      } else {
        setNotice(t('settings.msgPermissionNotGranted'));
      }
    } catch {
      setNotice(t('settings.msgNotificationsFailed'));
    }
    await refreshStatus();
  }, [permission, refreshStatus]);

  const handleTestNotification = useCallback(async () => {
    const result = await sendTestNotification().catch(() => ({
      ok: false,
      reason: t('settings.msgTestFailedDevice'),
    }));
    setNotice(
      result.ok
        ? t('settings.msgTestSending')
        : (result.reason ?? t('settings.msgTestFailed')),
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
      setNotice(tPlural('settings.msgRearmed', count));
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
          ? t('settings.msgNothingToSync', { reason: summary.reason ?? '' })
          : summary.errors.length
            ? t('settings.msgSyncedErrors', {
                pushed: summary.pushed,
                pulled: summary.pulled,
                errors: summary.errors.length,
              })
            : t('settings.msgSynced', {
                pushed: summary.pushed,
                pulled: summary.pulled,
              }),
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
              ? t('settings.msgExportedShared', { format: kind.toUpperCase() })
              : t('settings.msgExportedTo', { uri: result.uri ?? '' })
            : (result.reason ?? t('settings.msgExportFailed')),
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
      setDataNote(
        path ? t('settings.msgBackupWritten') : t('settings.msgBackupFailed'),
      );
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
        setDataNote(t('settings.msgNoLocalBackup'));
        return;
      }
      const text = await readLocalBackupText();
      if (!text) {
        setDataNote(t('settings.msgCouldNotReadBackup'));
        return;
      }
      await handleApplyImport(text);
    } catch {
      setDataNote(t('settings.msgCouldNotReadBackup'));
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
      setSyncMessage(t('settings.msgCleared'));
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
          accessibilityLabel={t('settings.close')}
        >
          <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
        </Pressable>
        <Text variant="title">{t('settings.title')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          paddingBottom: insets.bottom + 60,
          gap: theme.spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Section title={t('settings.sectionAppearance')} icon="color-palette-outline">
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            {THEME_OPTIONS.map((option) => (
              <Chip
                key={option.key}
                label={t(option.label)}
                icon={option.icon}
                selected={preference === option.key}
                onPress={() => setPreference(option.key)}
              />
            ))}
          </View>
        </Section>

        <Section title={t('settings.sectionNotifications')} icon="notifications-outline">
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
                  ? t('settings.notifOn')
                  : permission === 'denied'
                    ? t('settings.notifBlocked')
                    : t('settings.notifOff')}
              </Text>
              <Text variant="caption" color={theme.colors.textSecondary}>
                {permission === 'granted'
                  ? tPlural('settings.notifArmed', armed)
                  : permission === 'denied'
                    ? t('settings.notifBlockedBody')
                    : t('settings.notifOffBody')}
              </Text>
            </View>
          </View>

          <Row label={t('settings.rowScheduledReminders')} value={`${armed}`} />
          <Row label={t('settings.rowUnsyncedChanges')} value={`${pending}`} />

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
            <Chip
              label={
                permission === 'granted'
                  ? t('settings.chipReregisterDigest')
                  : permission === 'denied'
                    ? t('settings.chipOpenSystemSettings')
                    : t('settings.chipEnableNotifications')
              }
              icon={permission === 'denied' ? 'settings-outline' : 'alarm-outline'}
              selected={permission !== 'granted'}
              onPress={() => void handleEnableNotifications()}
            />
            <Chip
              label={t('settings.chipSendTest')}
              icon="paper-plane-outline"
              onPress={() => void handleTestNotification()}
            />
            <Chip
              label={busy ? t('common.working') : t('settings.chipRearmAll')}
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
            label={t('settings.dndLabel')}
            caption={t('settings.dndCaption')}
            value={dndBypass}
            onChange={(next) => {
              setDndBypass(next);
              void applyDndBypassPreference(next);
            }}
          />

          <Text variant="micro" color={theme.colors.textTertiary}>
            {t('settings.notifMicro')}
          </Text>
        </Section>

        <Section title={t('settings.sectionFocus')} icon="timer-outline">
          <ToggleRow
            label={t('settings.autoStartBreakLabel')}
            caption={t('settings.autoStartBreakCaption')}
            value={autoStartBreak}
            onChange={setAutoStartBreak}
          />
          <Row label={t('settings.rowDailyFocusGoal')} value={t('settings.minutesValue', { count: dailyGoalMinutes })} />
          <Row
            label={t('settings.rowWeeklyTaskGoal')}
            value={
              weeklyGoalTasks === 0
                ? t('settings.notSet')
                : tPlural('settings.countTasks', weeklyGoalTasks)
            }
          />
          <Text variant="caption" color={theme.colors.textSecondary}>
            {t('settings.focusHint')}
          </Text>
          <Text variant="micro" color={theme.colors.textTertiary}>
            {t('settings.focusMicro')}
          </Text>
        </Section>

        <Section title={t('settings.sectionSync')} icon="cloud-outline">
          <Row
            label={t('settings.rowBackend')}
            value={isSupabaseConfigured ? t('settings.backendConnected') : t('settings.backendLocal')}
          />
          <Row label={t('settings.rowPendingChanges')} value={`${pending}`} />
          {syncMessage ? (
            <Text variant="caption" color={theme.colors.textSecondary}>
              {syncMessage}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Chip label={busy ? t('common.working') : t('settings.chipSyncNow')} icon="refresh" onPress={() => void handleSync()} />
          </View>

          {isSupabaseConfigured ? (
            sessionEmail ? (
              <>
                <Row label={t('settings.rowSignedInAs')} value={sessionEmail} />
                <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                  <Chip label={t('settings.chipSignOut')} icon="log-out-outline" onPress={() => void handleSignOut()} />
                </View>
              </>
            ) : (
              <View style={{ gap: theme.spacing.sm }}>
                <TextInput
                  value={signInEmail}
                  onChangeText={setSignInEmail}
                  accessibilityLabel={t('settings.emailA11y')}
                  placeholder={t('settings.emailPlaceholder')}
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
                    label={
                      linkSent ? t('settings.chipLinkSent') : t('settings.chipSendSignInLink')
                    }
                    icon="mail-outline"
                    onPress={() => void handleSendSignInLink()}
                  />
                </View>
              </View>
            )
          ) : null}
          {!isSupabaseConfigured ? (
            <Text variant="micro" color={theme.colors.textTertiary}>
              {t('settings.syncMicro')}
            </Text>
          ) : null}
        </Section>

        <Section title={t('settings.sectionSecurity')} icon="lock-closed-outline">
          <ToggleRow
            label={t('settings.appLockLabel')}
            caption={t('settings.appLockCaption')}
            value={appLock}
            onChange={setAppLock}
          />
        </Section>

        <Section title={t('settings.sectionData')} icon="server-outline">
          <Row label={t('settings.rowProjects')} value={`${projects.length}`} />
          <Row label={t('settings.rowTasks')} value={`${tasks.length}`} />
          <Row label={t('settings.rowHabits')} value={`${habits.length}`} />
          <Row
            label={t('settings.rowLocalBackup')}
            value={
              backup.exists && backup.modifiedAt
                ? new Date(backup.modifiedAt).toLocaleString()
                : t('settings.backupNoneYet')
            }
          />

          <ToggleRow
            label={t('settings.weeklyBackupLabel')}
            caption={t('settings.weeklyBackupCaption')}
            value={weeklyBackup}
            onChange={(next) => {
              setWeeklyBackup(next);
              if (next) void runWeeklyBackupNow();
            }}
          />
          <Row
            label={t('settings.rowLastBackup')}
            value={
              lastBackupAt ? new Date(lastBackupAt).toLocaleString() : t('settings.backupNever')
            }
          />

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
            <Chip
              label={t('settings.chipExportJson')}
              icon="download-outline"
              accessibilityLabel={t('settings.chipExportJsonA11y')}
              onPress={() => void handleExport('json')}
            />
            <Chip
              label={t('settings.chipExportCsv')}
              icon="grid-outline"
              accessibilityLabel={t('settings.chipExportCsvA11y')}
              onPress={() => void handleExport('csv')}
            />
            <Chip
              label={t('settings.chipImport')}
              icon="push-outline"
              accessibilityLabel={t('settings.chipImportA11y')}
              onPress={() => {
                setDataNote(null);
                setImportOpen(true);
              }}
            />
            <Chip
              label={busy ? t('common.working') : t('settings.chipBackupNow')}
              icon="save-outline"
              accessibilityLabel={t('settings.chipBackupNowA11y')}
              onPress={() => void handleBackupNow()}
            />
            <Chip
              label={t('settings.chipRestoreBackup')}
              icon="refresh-outline"
              accessibilityLabel={t('settings.chipRestoreBackupA11y')}
              onPress={() => void handleRestoreBackup()}
            />
          </View>

          {dataNote ? (
            <Text variant="caption" color={theme.colors.accent}>
              {dataNote}
            </Text>
          ) : null}

          <Text variant="caption" color={theme.colors.textSecondary}>
            {t('settings.privacy')}
          </Text>

          <Text variant="micro" color={theme.colors.textTertiary}>
            {t('settings.dataMicro')}
          </Text>
          <Chip
            label={t('settings.chipReset')}
            icon="trash-outline"
            color={theme.colors.danger}
            accessibilityLabel={t('settings.chipResetA11y')}
            onPress={() => void handleReset()}
          />
        </Section>

        <Section title="TaskFlow" icon="information-circle-outline">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <BrandMark size={52} />
            <View style={{ flex: 1 }}>
              <Text variant="heading">TaskFlow</Text>
              <Text variant="caption" color={theme.colors.textSecondary}>
                {t('settings.tagline')}
              </Text>
            </View>
          </View>
          <Text variant="caption" color={theme.colors.textSecondary}>
            {t('settings.aboutBody')}
          </Text>
          <Chip
            label={t('settings.chipShowTour')}
            icon="school-outline"
            accessibilityLabel={t('settings.chipShowTourA11y')}
            onPress={() => {
              // The overlay lives in the root layout, so turning the flag off is
              // all it takes for the tour to be back over this screen.
              setOnboarded(false);
            }}
          />
          <Divider />
          <Text variant="micro" color={theme.colors.textTertiary}>
            {t('settings.versionMicro', { version: Constants.expoConfig?.version ?? '—' })}
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
        title={t('settings.importTitle')}
        subtitle={t('settings.importSubtitle')}
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
            accessibilityLabel={t('settings.importPasteA11y')}
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
              label={busy ? t('common.working') : t('settings.chipCheckFile')}
              icon="search-outline"
              selected={importPlan === null}
              accessibilityLabel={t('settings.chipCheckFileA11y')}
              onPress={() => void handleCheckImport(importText)}
            />
            {importPlan && importPlan.totalNew > 0 ? (
              <Chip
                label={
                  busy
                    ? t('settings.chipImporting')
                    : tPlural('settings.importAdd', importPlan.totalNew)
                }
                icon="push-outline"
                selected
                accessibilityLabel={t('settings.importAddA11y')}
                onPress={() => void handleApplyImport(importText)}
              />
            ) : null}
            <Chip
              label={t('common.cancel')}
              accessibilityLabel={t('settings.cancelImportA11y')}
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
