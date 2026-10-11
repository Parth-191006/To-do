import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Chip, EmptyState, Text } from '@/components/ui';
import { looksLikeInviteToken } from '@/domain/invites';
import { t } from '@/i18n';
import {
  acceptListInvite,
  clearPendingInvite,
  stashPendingInvite,
} from '@/services/supabase/invites';
import { getSessionEmail, isSupabaseConfigured } from '@/services/supabase/client';
import { useStore } from '@/store/useStore';
import { useTheme } from '@/theme/ThemeProvider';

type Phase = 'checking' | 'accepting' | 'accepted' | 'signedOut' | 'failed';

const FAILURE_KEY: Record<string, string> = {
  'not-found': 'join.failNotFound',
  expired: 'join.failExpired',
  used: 'join.failUsed',
  'wrong-email': 'join.failWrongEmail',
  unknown: 'join.failUnknown',
  'not-configured': 'join.failNotConfigured',
} as const;

/**
 * The landing screen for `taskflow://join/<token>`.
 *
 * An invite link is the one deep link in the app that can arrive *before* the
 * user has an account, so this screen owns all four states explicitly:
 *
 *  - signed in → consume the token and land on the list;
 *  - signed out → park the token on disk and send the user to sign in; the
 *    root layout replays it the moment a session appears, because re-finding
 *    the email is the step that loses people;
 *  - token dead (expired / used by someone else / wrong email) → say which,
 *    rather than a generic failure that reads as a broken link;
 *  - no backend on this build → explain, do not pretend.
 */
export default function JoinInviteScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const refresh = useStore((state) => state.refresh);

  const [phase, setPhase] = useState<Phase>('checking');
  const [failureKey, setFailureKey] = useState<string>('join.failUnknown');
  // The transition to `accepting` is guarded: a re-render (or a second tap on
  // a stale link) must not consume the single-use token twice from the client
  // side, even though the RPC itself is idempotent for the acceptor.
  const attempted = useRef(false);

  const runAccept = useCallback(
    async (rawToken: string) => {
      attempted.current = true;
      setPhase('accepting');
      const result = await acceptListInvite(rawToken);
      if (result.ok) {
        await clearPendingInvite();
        await refresh();
        setPhase('accepted');
        setTimeout(() => router.replace(`/project/${result.projectId}`), 700);
        return;
      }
      setFailureKey(FAILURE_KEY[result.reason] ?? 'join.failUnknown');
      setPhase('failed');
    },
    [refresh, router],
  );

  useEffect(() => {
    if (attempted.current) return;
    const raw = typeof token === 'string' ? token.trim().toLowerCase() : '';
    if (!looksLikeInviteToken(raw)) {
      setFailureKey('join.failNotFound');
      setPhase('failed');
      return;
    }

    void (async () => {
      if (!isSupabaseConfigured) {
        setFailureKey('join.failNotConfigured');
        setPhase('failed');
        return;
      }
      const email = await getSessionEmail().catch(() => null);
      if (!email) {
        // Park it: the root layout drains this after the magic-link sign-in.
        await stashPendingInvite(raw);
        setPhase('signedOut');
        return;
      }
      await runAccept(raw);
    })();
  }, [runAccept, token]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingTop: insets.top + 60,
        paddingHorizontal: theme.spacing.lg,
        paddingBottom: insets.bottom + 24,
      }}
    >
      {phase === 'checking' || phase === 'accepting' ? (
        <EmptyState
          icon="mail-open-outline"
          title={t('join.working')}
          subtitle={t('join.workingBody')}
        />
      ) : null}

      {phase === 'accepted' ? (
        <EmptyState
          icon="checkmark-circle-outline"
          title={t('join.accepted')}
          subtitle={t('join.acceptedBody')}
        />
      ) : null}

      {phase === 'signedOut' ? (
        <View style={{ gap: theme.spacing.lg }}>
          <EmptyState
            icon="person-circle-outline"
            title={t('join.signedOutTitle')}
            subtitle={t('join.signedOutBody')}
          />
          <Card>
            <View style={{ gap: theme.spacing.md }}>
              <Text variant="caption" color={theme.colors.textSecondary}>
                {t('join.signedOutHow')}
              </Text>
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
                <Chip
                  label={t('join.goSignIn')}
                  icon="log-in-outline"
                  selected
                  accessibilityLabel={t('join.goSignInA11y')}
                  onPress={() => router.push('/settings')}
                />
                <Chip
                  label={t('common.cancel')}
                  accessibilityLabel={t('common.cancel')}
                  onPress={() => {
                    void clearPendingInvite().then(() => router.back());
                  }}
                />
              </View>
              <Text variant="micro" color={theme.colors.textTertiary}>
                {t('join.parkedMicro')}
              </Text>
            </View>
          </Card>
        </View>
      ) : null}

      {phase === 'failed' ? (
        <View style={{ gap: theme.spacing.lg }}>
          <EmptyState
            icon="alert-circle-outline"
            title={t('join.failedTitle')}
            subtitle={t(failureKey as never)}
          />
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Chip
              label={t('join.backToApp')}
              icon="home-outline"
              selected
              accessibilityLabel={t('join.backToAppA11y')}
              onPress={() => router.replace('/')}
            />
          </View>
          {failureKey === 'join.failNotConfigured' ? (
            <Pressable
              onPress={() => router.push('/settings')}
              accessibilityRole="link"
              accessibilityLabel={t('join.openSettingsA11y')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <Ionicons name="settings-outline" size={14} color={theme.colors.accent} />
              <Text variant="caption" color={theme.colors.accent}>
                {t('join.openSettings')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
