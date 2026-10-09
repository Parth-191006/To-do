import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { View } from 'react-native';

import { TOUR_STEPS, formatStepLabel, primaryActionLabel } from '@/domain/tour';
import { usePreferences } from '@/store/usePreferences';
import { useTheme } from '@/theme/ThemeProvider';
import { selection } from '@/utils/haptics';

import { BrandMark } from './BrandMark';
import { Chip, Text } from './ui';

/**
 * The first-install overview.
 *
 * Shown once: the preferences store reports when it has finished reading from
 * disk (`hydrated`), because the default is "not onboarded" — without that flag
 * the tour would flash on every launch for the fraction of a second before the
 * saved answer loads.
 *
 * It renders over the navigator rather than as a route, so it cannot be swiped
 * away into a half-configured app, and it is dismissible from the first step:
 * a tour you cannot skip is an advertisement.
 */
export function OnboardingTour() {
  const theme = useTheme();
  const hydrated = usePreferences((state) => state.hydrated);
  const onboarded = usePreferences((state) => state.onboarded);
  const setOnboarded = usePreferences((state) => state.setOnboarded);
  const [index, setIndex] = useState(0);

  if (!hydrated || onboarded) return null;

  const step = TOUR_STEPS[index] ?? TOUR_STEPS[0]!;
  const isLast = index === TOUR_STEPS.length - 1;

  const finish = () => {
    selection();
    setOnboarded(true);
  };

  return (
    <View
      style={{
        ...StyleSheetAbsolute,
        backgroundColor: theme.colors.background,
        paddingTop: theme.spacing['2xl'],
        paddingBottom: theme.spacing.xl,
        paddingHorizontal: theme.spacing.lg,
        justifyContent: 'space-between',
      }}
      accessibilityViewIsModal
      accessibilityLabel="TaskFlow overview"
    >
      <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
        <BrandMark size={44} />
        <Text variant="micro" color={theme.colors.textTertiary}>
          {formatStepLabel(index).toUpperCase()}
        </Text>
      </View>

      <View style={{ gap: theme.spacing.lg }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.accentSoft,
          }}
        >
          <Ionicons
            name={step.icon as keyof typeof Ionicons.glyphMap}
            size={26}
            color={theme.colors.accent}
          />
        </View>
        <Text variant="display">{step.title}</Text>
        <Text variant="body" color={theme.colors.textSecondary}>
          {step.body}
        </Text>
      </View>

      <View style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {TOUR_STEPS.map((entry, dot) => (
            <View
              key={entry.id}
              style={{
                width: dot === index ? 22 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: dot === index ? theme.colors.accent : theme.colors.borderStrong,
              }}
            />
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
          <Chip
            label={primaryActionLabel(index)}
            icon={isLast ? 'checkmark-circle-outline' : 'arrow-forward-outline'}
            selected
            accessibilityLabel={primaryActionLabel(index)}
            onPress={() => (isLast ? finish() : setIndex((next) => next + 1))}
          />
          <Chip label="Skip the tour" accessibilityLabel="Skip the tour" onPress={finish} />
        </View>

        <Text variant="micro" color={theme.colors.textTertiary}>
          REOPEN IT ANY TIME FROM SETTINGS → TASKFLOW. NOTHING HERE IS A ONE-TIME CHOICE.
        </Text>
      </View>
    </View>
  );
}

/** A full-bleed overlay that sits above the navigator but below the toast. */
const StyleSheetAbsolute = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 40,
};
