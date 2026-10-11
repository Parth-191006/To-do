import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Linking, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppLock } from '@/components/AppLock';
import { OnboardingTour } from '@/components/OnboardingTour';
import { PermissionGate } from '@/components/PermissionSheet';
import { Text } from '@/components/ui';
import {
  applyDndBypassPreference,
  clearGeofences,
  configureNotifications,
  consumeInitialNotificationResponse,
  subscribeToNotificationResponses,
  syncGeofences,
  type NotificationOutcome,
} from '@/services/notifications';
import { runWeeklyBackupIfDue } from '@/services/data/weeklyBackup';
import { installCrashLog } from '@/services/crashLog';
import {
  completeSignInFromUrl,
  getSessionEmail,
  isSupabaseConfigured,
  subscribeToAuthChanges,
} from '@/services/supabase/client';
import { acceptListInvite, drainPendingInvite } from '@/services/supabase/invites';
import { usePreferences } from '@/store/usePreferences';
import { useStore } from '@/store/useStore';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const status = useStore((state) => state.status);
  const bootstrap = useStore((state) => state.bootstrap);
  const refresh = useStore((state) => state.refresh);
  const lastOutcome = useStore((state) => state.lastOutcome);
  const setLastOutcome = useStore((state) => state.setLastOutcome);
  const router = useRouter();

  useEffect(() => {
    void configureNotifications();
    void bootstrap();
  }, [bootstrap]);

  // The crash log installs its global handler regardless of the toggle (the
  // handler cannot be swapped later once errors are flying); the preference is
  // read at capture time, so "off by default" means nothing is stored until
  // the user opts in under Settings → Diagnostics.
  useEffect(() => {
    installCrashLog();
  }, []);

  // The Do Not Disturb choice has to reach the notification layer before
  // anything is scheduled. The preference is restored from disk asynchronously,
  // so this effect runs twice on a cold start: once with the default (off) and
  // again when the stored value lands. Both calls are idempotent.
  const dndBypass = usePreferences((state) => state.dndBypass);
  useEffect(() => {
    void applyDndBypassPreference(dndBypass);
  }, [dndBypass]);

  // The automatic backup has no background worker: it runs once per launch and
  // does nothing unless a week has passed and the user asked for it.
  const preferencesHydrated = usePreferences((state) => state.hydrated);
  useEffect(() => {
    if (!preferencesHydrated) return;
    void runWeeklyBackupIfDue();
  }, [preferencesHydrated]);

  // Place reminders are an Experimental preview, so the switch has to reach the
  // OS as well as the UI. Turning it off disarms the fences Android is already
  // holding (a saved reminder is kept, never deleted); turning it back on
  // re-arms them, which the signature gate would otherwise skip as "unchanged".
  // Waiting for hydration matters: the default is "off", and acting on it a
  // frame before the saved value lands would tear down fences the user still
  // wants.
  const experimental = usePreferences((state) => state.experimental);
  useEffect(() => {
    if (!preferencesHydrated) return;
    if (experimental) {
      void syncGeofences(useStore.getState().tasks).catch(() => undefined);
    } else {
      void clearGeofences().catch(() => undefined);
    }
  }, [experimental, preferencesHydrated]);

  /**
   * Actionable notification taps mutate data outside React, so we always
   * refresh, and we navigate when the tap carried a destination.
   */
  const handleOutcome = useCallback(
    (outcome: NotificationOutcome) => {
      setLastOutcome(outcome.message);
      void refresh();
      if (outcome.url) {
        // Let the navigator mount before pushing.
        setTimeout(() => router.push(outcome.url as never), 60);
      }
    },
    [refresh, router, setLastOutcome],
  );

  // Taps that arrive while the app is alive…
  useEffect(() => subscribeToNotificationResponses(handleOutcome), [handleOutcome]);

  // …and the tap that launched the app from cold.
  const drainedInitialRef = useRef(false);
  useEffect(() => {
    if (drainedInitialRef.current) return;
    drainedInitialRef.current = true;
    void consumeInitialNotificationResponse().then((outcome) => {
      if (outcome) handleOutcome(outcome);
    });
  }, [handleOutcome]);

  // Magic-link sign-in: the link opened the app through the `taskflow://`
  // scheme, so the redirect has to be consumed here — otherwise the link
  // appears to do nothing and the user stays signed out forever.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const consume = (url: string | null) => {
      if (!url) return;
      void completeSignInFromUrl(url).then((signedIn) => {
        if (signedIn) void refresh();
      });
    };
    const subscription = Linking.addEventListener('url', ({ url }) => consume(url));
    void Linking.getInitialURL().then(consume);
    return () => subscription.remove();
  }, [refresh]);

  // A parked invite is the half of the join flow that survives signing in.
  // The invite link arrives before the invitee has an account, so /join/[token]
  // stores the token and sends them to Settings › Sync; the moment a session
  // exists — however it was established — this drains the token and joins the
  // list, so the person never has to find the email again. Subscribed to auth
  // changes rather than run once, because the session usually appears *after*
  // mount, via the magic-link redirect consumed above.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    const tryPending = async () => {
      const email = await getSessionEmail().catch(() => null);
      if (!email || cancelled) return;
      const token = await drainPendingInvite();
      if (!token || cancelled) return;
      const result = await acceptListInvite(token);
      if (result.ok && !cancelled) {
        await refresh();
        setLastOutcome('Invite accepted — the shared list is now yours');
        setTimeout(() => router.push(`/project/${result.projectId}` as never), 240);
      }
    };
    void tryPending();
    return subscribeToAuthChanges(() => {
      void tryPending();
    });
  }, [refresh, router, setLastOutcome]);

  useEffect(() => {
    if (status === 'ready' || status === 'error') {
      void SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [status]);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedShell lastOutcome={lastOutcome} onOutcomeShown={() => setLastOutcome(null)} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function ThemedShell({
  lastOutcome,
  onOutcomeShown,
}: {
  lastOutcome: string | null;
  onOutcomeShown: () => void;
}) {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    opacity.setValue(0);
    if (!lastOutcome) return;
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) onOutcomeShown();
    });
  }, [lastOutcome, onOutcomeShown, opacity]);

  return (
    <>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      {/* Optional biometric lock; a no-op pass-through while it is off. */}
      <AppLock>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.colors.background },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="task/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="project/[id]" />
          <Stack.Screen name="join/[token]" options={{ presentation: 'card' }} />
          <Stack.Screen name="add" options={{ presentation: 'modal' }} />
          <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        </Stack>
      </AppLock>

      {/* Explain-then-ask gate for every OS permission the app requests. */}
      <PermissionGate />

      {/* First-install overview: four cards, once, skippable from the start. */}
      <OnboardingTour />

      {lastOutcome ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toast,
            {
              opacity,
              backgroundColor: theme.colors.textPrimary,
              borderRadius: theme.radii.pill,
            },
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="notifications-outline" size={15} color={theme.colors.textInverse} />
            <Text variant="caption" color={theme.colors.textInverse}>
              {lastOutcome}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 104,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
});
