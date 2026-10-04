import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Linking, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PermissionGate } from '@/components/PermissionSheet';
import { Text } from '@/components/ui';
import {
  configureNotifications,
  consumeInitialNotificationResponse,
  subscribeToNotificationResponses,
  type NotificationOutcome,
} from '@/services/notifications';
import { completeSignInFromUrl, isSupabaseConfigured } from '@/services/supabase/client';
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
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
      </Stack>

      {/* Explain-then-ask gate for every OS permission the app requests. */}
      <PermissionGate />

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
