import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { BottomSheet } from './BottomSheet';
import { Chip, Text } from './ui';

import {
  pendingPermissionKind,
  resolvePermissionPrompt,
  usePermissionPrompt,
} from '@/store/usePermissionPrompt';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * "Explain, then ask."
 *
 * Android and iOS only ever show a system dialog once. Asking cold — the moment
 * a user saves their first reminder — burns that single chance before they know
 * why TaskFlow wants it, and a denial is then permanent from the app's point of
 * view. This sheet states the reason *first*; only the Allow tap reaches the OS
 * prompt. TaskFlow ships no permission prompt that arrives without one.
 */

interface Copy {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  allow: string;
  deny: string;
}

const COPY: Record<string, Copy> = {
  notifications: {
    icon: 'notifications-outline',
    title: 'Turn on reminders?',
    body: 'TaskFlow schedules every reminder locally on this device. Notifications are how a due task, a recurring reminder, a habit nudge and the end of a focus block actually reach you.',
    allow: 'Allow notifications',
    deny: 'Not now',
  },
  location: {
    icon: 'location-outline',
    title: 'Place reminders need location',
    body: 'A place reminder watches for your arrival or departure — for example “when I reach the office”. Android asks for “all the time” access for this; without it the reminder stays off until you open the app.',
    allow: 'Allow location',
    deny: 'Not now',
  },
  microphone: {
    icon: 'mic-outline',
    title: 'Voice capture needs the microphone',
    body: 'Voice notes are recorded on this device and attached to your task. Nothing is uploaded unless you also configure a transcription endpoint.',
    allow: 'Allow microphone',
    deny: 'Not now',
  },
  photos: {
    icon: 'image-outline',
    title: 'Photos need library access',
    body: 'Pick an image to attach it to a task. TaskFlow only reads the picture you choose.',
    allow: 'Allow photos',
    deny: 'Not now',
  },
};

/** Mount once, next to the navigator — it renders whichever prompt is pending. */
export function PermissionGate() {
  const theme = useTheme();
  const pending = usePermissionPrompt((state) => state.pending);
  const kind = pendingPermissionKind(pending);
  const copy = kind ? COPY[kind] : null;

  return (
    <BottomSheet
      visible={copy !== null}
      onClose={() => resolvePermissionPrompt(false)}
      title={copy?.title}
      subtitle="You can change this later in system settings."
      heightRatio={0.5}
    >
      {copy ? (
        <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.accentSoft,
              }}
            >
              <Ionicons name={copy.icon} size={20} color={theme.colors.accent} />
            </View>
            <Text variant="body" color={theme.colors.textSecondary} style={{ flex: 1 }}>
              {copy.body}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
            <Chip
              label={copy.allow}
              icon="checkmark-circle-outline"
              selected
              accessibilityLabel={copy.allow}
              onPress={() => resolvePermissionPrompt(true)}
            />
            <Chip
              label={copy.deny}
              accessibilityLabel={copy.deny}
              onPress={() => resolvePermissionPrompt(false)}
            />
          </View>

          <Text variant="micro" color={theme.colors.textTertiary}>
            TASKFLOW NEVER NAGS TWICE — IF YOU SAY NO, THE FEATURE SIMPLY STAYS OFF AND EVERYTHING ELSE
            KEEPS WORKING OFFLINE.
          </Text>
        </View>
      ) : null}
    </BottomSheet>
  );
}
