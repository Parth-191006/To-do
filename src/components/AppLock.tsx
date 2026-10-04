import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';

import { usePreferences } from '@/store/usePreferences';
import { useTheme } from '@/theme/ThemeProvider';
import { selection } from '@/utils/haptics';

import { BrandMark } from './BrandMark';
import { ScalePress, Text } from './ui';

/** How long the app may sit in the background before the lock re-arms. */
export const LOCK_AFTER_BACKGROUND_MS = 30_000;

/**
 * Optional app lock.
 *
 * Uses `expo-local-authentication`, which asks the OS for biometrics and
 * automatically falls back to the device PIN/pattern/password
 * (`disableDeviceFallback: false`), so devices without a fingerprint reader
 * still have a working lock. The plugin's Android permission is
 * `USE_BIOMETRIC`; nothing here is a network call.
 *
 * The lock re-arms after 30 s in the background rather than on every state
 * change, so switching to check a notification does not demand a fingerprint
 * again — the usual reason people turn a lock off.
 */
export function AppLock({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const enabled = usePreferences((s) => s.appLock);
  const [unlocked, setUnlocked] = useState(!enabled);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const authenticate = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !enrolled) {
        // Nothing to authenticate against — refusing to lock the app would be
        // worse than letting the user in, so say why and allow it.
        setMessage('No screen lock is set up on this device — the app will not lock.');
        setUnlocked(true);
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock TaskFlow',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      if (result.success) {
        selection();
        setUnlocked(true);
      } else {
        setMessage('Not recognised — try again, or close the app.');
      }
    } catch {
      setMessage('This device could not run the lock check.');
    } finally {
      setBusy(false);
    }
  }, []);

  // Lock on cold start…
  useEffect(() => {
    if (enabled && !unlocked) void authenticate();
    // Only on the transition into "locked".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // …and again after a real absence from the app.
  useEffect(() => {
    let backgroundedAt: number | null = null;
    const subscription = AppState.addEventListener('change', (next) => {
      if (!enabled) return;
      if (next === 'background') {
        backgroundedAt = Date.now();
        return;
      }
      if (next === 'active' && backgroundedAt !== null) {
        if (Date.now() - backgroundedAt > LOCK_AFTER_BACKGROUND_MS) setUnlocked(false);
        backgroundedAt = null;
      }
    });
    return () => subscription.remove();
  }, [enabled]);

  if (!enabled || unlocked) return <>{children}</>;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.lg,
        padding: theme.spacing['2xl'],
      }}
    >
      <BrandMark size={86} />
      <Text variant="title" align="center">
        TaskFlow is locked
      </Text>
      <Text variant="caption" color={theme.colors.textSecondary} align="center">
        Unlock with your fingerprint, face or device PIN. Your data never leaves this device.
      </Text>
      {message ? (
        <Text variant="caption" color={theme.colors.warning} align="center">
          {message}
        </Text>
      ) : null}
      <ScalePress
        haptic={false}
        disabled={busy}
        onPress={() => void authenticate()}
        accessibilityLabel="Unlock TaskFlow"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          minHeight: 52,
          paddingHorizontal: theme.spacing['2xl'],
          borderRadius: theme.radii.pill,
          backgroundColor: theme.colors.accent,
          opacity: busy ? 0.6 : 1,
        }}
      >
        <Ionicons name="finger-print" size={19} color={theme.colors.accentContrast} />
        <Text variant="bodyStrong" color={theme.colors.accentContrast}>
          {busy ? 'Waiting…' : 'Unlock'}
        </Text>
      </ScalePress>
      <Pressable onPress={() => void authenticate()} hitSlop={10} accessibilityLabel="Try unlocking again">
        <Text variant="caption" color={theme.colors.textTertiary}>
          Try again
        </Text>
      </Pressable>
    </View>
  );
}
