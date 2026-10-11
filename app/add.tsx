import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip, EmptyState, Text } from '@/components/ui';
import { parseTaskInput } from '@/nlp/parser';
import { useStore } from '@/store/useStore';
import { useTheme } from '@/theme/ThemeProvider';
import { success } from '@/utils/haptics';

/**
 * Quick add by link: `taskflow://add?text=Review%20designs%20tomorrow%204pm`.
 *
 * This is the part of "share sheet quick add" that needs no native module. A
 * true inbound share target (TaskFlow appearing in Android's share sheet) has
 * to register an `ACTION_SEND` intent filter and read the shared text from the
 * launching Intent — React Native's `IntentModule` only surfaces `ACTION_VIEW`,
 * so that half needs a native module and a development build; it is written up
 * in README → Known limitations rather than half-built here.
 *
 * What this route *does* give: any app that can open a URL — a browser
 * bookmarklet, Tasker, a shortcut, a messaging bot — can push text into
 * TaskFlow. The screen confirms before writing, because a link that silently
 * mutates your task list is a trap; the parser's own chips show what will be
 * created, so the confirmation is informative rather than a blind "OK".
 */
export default function QuickAddFromLinkScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { text } = useLocalSearchParams<{ text?: string | string[] }>();
  const addTaskFromInput = useStore((state) => state.addTaskFromInput);

  const raw = (Array.isArray(text) ? text[0] : text) ?? '';
  const parsed = useMemo(() => parseTaskInput(raw), [raw]);
  // Guard against the effect running twice under Fast Refresh or a double
  // initial-URL delivery — the second pass would create a duplicate task.
  const added = useRef(false);

  useEffect(() => {
    // Nothing to add: say so and leave, rather than showing an empty confirm.
    if (!raw.trim()) router.replace('/');
  }, [raw, router]);

  const handleAdd = async () => {
    if (added.current) return;
    added.current = true;
    const created = await addTaskFromInput(raw);
    if (created) {
      success();
      // Land on Today so the new task is visible where the user expects it.
      router.replace('/');
    } else {
      added.current = false;
    }
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingTop: insets.top + 60,
        paddingHorizontal: theme.spacing.lg,
        paddingBottom: insets.bottom + 24,
        gap: theme.spacing.lg,
      }}
    >
      <EmptyState
        icon="add-circle-outline"
        title="Add this to TaskFlow?"
        subtitle={raw.trim() ? undefined : 'This link carried no text to add.'}
      >
        {raw.trim() ? (
          <View style={{ gap: theme.spacing.md, width: '100%' }}>
            <Text variant="bodyStrong" style={{ textAlign: 'center' }}>
              {parsed.title}
            </Text>
            {parsed.tokens.length > 0 ? (
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 6,
                  justifyContent: 'center',
                }}
              >
                {parsed.tokens.map((token) => (
                  <Chip
                    key={`${token.kind}-${token.start}`}
                    label={token.label}
                    compact
                    icon="sparkles-outline"
                  />
                ))}
              </View>
            ) : null}
            <View
              style={{
                flexDirection: 'row',
                gap: theme.spacing.sm,
                justifyContent: 'center',
                marginTop: theme.spacing.sm,
              }}
            >
              <Chip
                label="Add task"
                icon="checkmark-circle-outline"
                selected
                accessibilityLabel={`Add the task ${parsed.title}`}
                onPress={() => void handleAdd()}
              />
              <Chip
                label="Discard"
                accessibilityLabel="Discard this shared text"
                onPress={() => router.replace('/')}
              />
            </View>
            <View style={{ alignItems: 'center' }}>
              <Ionicons
                name="shield-checkmark-outline"
                size={14}
                color={theme.colors.textTertiary}
              />
              <Text variant="micro" color={theme.colors.textTertiary}>
                NOTHING IS SAVED UNTIL YOU TAP “ADD TASK”.
              </Text>
            </View>
          </View>
        ) : null}
      </EmptyState>
    </View>
  );
}
