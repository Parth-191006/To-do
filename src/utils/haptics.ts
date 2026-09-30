import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Haptics wrapper. Every call is fire-and-forget and swallows errors: haptic
 * feedback is a flourish, never something that should break an interaction
 * (web and some Android devices have no vibrator at all).
 */

const supported = Platform.OS === 'ios' || Platform.OS === 'android';

export function tapLight(): void {
  if (!supported) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

export function tapMedium(): void {
  if (!supported) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
}

export function tapHeavy(): void {
  if (!supported) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
}

/** Task completion — a crisp success notification. */
export function success(): void {
  if (!supported) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

export function warning(): void {
  if (!supported) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
}

export function selection(): void {
  if (!supported) return;
  void Haptics.selectionAsync().catch(() => undefined);
}
