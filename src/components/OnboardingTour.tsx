import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { TOUR_STEPS, formatStepLabel, primaryActionLabel } from '@/domain/tour';
import { usePreferences } from '@/store/usePreferences';
import { useTheme } from '@/theme/ThemeProvider';
import { selection } from '@/utils/haptics';

import { BrandMark } from './BrandMark';
import { Button, Text } from './ui';

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
 *
 * Laid out as three quiet blocks — mark, message, controls — with the copy
 * centred and nothing else on screen. The previous version stacked a step
 * counter, an icon badge, a display title, a paragraph and an all-caps footer
 * sentence, which is a lot of furniture for one sentence of content.
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
        paddingHorizontal: theme.spacing.xl,
        justifyContent: 'space-between',
      }}
      accessibilityViewIsModal
      accessibilityLabel="TaskFlow overview"
    >
      <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
        <BrandMark size={48} bare />
        <Text variant="caption" color={theme.colors.textTertiary}>
          {formatStepLabel(index)}
        </Text>
      </View>

      <View style={{ alignItems: 'center', gap: theme.spacing.lg }}>
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.accentSoft,
          }}
        >
          <Ionicons
            name={step.icon as keyof typeof Ionicons.glyphMap}
            size={24}
            color={theme.colors.accent}
          />
        </View>
        <Text variant="display" align="center">
          {step.title}
        </Text>
        <Text variant="body" color={theme.colors.textSecondary} align="center">
          {step.body}
        </Text>
      </View>

      <View style={{ alignItems: 'center', gap: theme.spacing.lg }}>
        <View style={{ flexDirection: 'row', gap: 6 }} accessibilityRole="progressbar">
          {TOUR_STEPS.map((entry, dot) => (
            <View
              key={entry.id}
              style={{
                width: dot === index ? 20 : 7,
                height: 7,
                borderRadius: 4,
                backgroundColor:
                  dot === index ? theme.colors.accent : theme.colors.borderStrong,
              }}
            />
          ))}
        </View>

        {/*
          The primary action is a centred pill rather than a full-bleed bar: at
          full width it reads as a system banner pinned to the bottom of the
          screen, and the tour is not a dialog that needs dismissing.
        */}
        <View style={{ width: '100%', maxWidth: 340, alignSelf: 'center', gap: theme.spacing.xs }}>
          <Button
            label={primaryActionLabel(index)}
            icon={isLast ? 'checkmark' : 'arrow-forward'}
            onPress={() => {
              if (isLast) finish();
              else {
                selection();
                setIndex((next) => next + 1);
              }
            }}
          />
          {/*
            Skip is reachable from the first step and is a quiet text button, not
            a second pill competing with the primary action. It disappears on the
            last step, where the primary button already means "leave the tour".
            The Maestro flows address it by this label.
          */}
          {isLast ? null : (
            <Pressable
              onPress={finish}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Skip the tour"
              style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text variant="caption" color={theme.colors.textTertiary}>
                Skip the tour
              </Text>
            </Pressable>
          )}
        </View>
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
