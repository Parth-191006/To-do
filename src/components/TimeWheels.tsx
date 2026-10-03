import React, { useEffect, useRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { clamp } from '@/utils/id';

import { Text } from './ui';

/**
 * Scroll-wheel duration picker that lives inside the focus timer's ring —
 * slide through hours / minutes / seconds the way the system Clock app lets
 * you dial in a time, instead of choosing from preset chips alone.
 *
 * Gesture notes:
 *  - Each column is a snapping ScrollView, so a flick lands cleanly on one
 *    value and vertical drags starting on a wheel never scroll the page.
 *  - `selfRef` records the indexes a column produced itself. The effect that
 *    jumps the wheel for *external* changes (preset chips, switching between
 *    focus and break) must never fight an in-flight flick by scrolling back to
 *    the value the column just reported — hence the self-emitted guard.
 */

/** One wheel row — tall enough to read, short enough that five fit in the ring. */
const ITEM = 32;
const VISIBLE = 5;
const WHEEL_HEIGHT = ITEM * VISIBLE;
const COLUMN_WIDTH = 56;
/** Top/bottom spacer so the first and last item can reach the middle band. */
const PAD = ITEM * ((VISIBLE - 1) / 2);

interface ColumnProps {
  label: string;
  count: number;
  index: number;
  accent: string;
  onIndexChange: (next: number) => void;
}

function Column({ label, count, index, accent, onIndexChange }: ColumnProps) {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const selfRef = useRef(index);
  const indexRef = useRef(index);
  indexRef.current = index;

  // Seat the wheel on the current value once the ScrollView has laid out.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: indexRef.current * ITEM, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // External value changes (chips, mode flip) jump the wheel; self-emitted
  // ones are left alone so the user's momentum plays out untouched.
  useEffect(() => {
    if (index === selfRef.current) return;
    selfRef.current = index;
    scrollRef.current?.scrollTo({ y: index * ITEM, animated: false });
  }, [index]);

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = clamp(Math.round(event.nativeEvent.contentOffset.y / ITEM), 0, count - 1);
    if (next === indexRef.current) return;
    selfRef.current = next;
    onIndexChange(next);
  };

  return (
    <View style={{ width: COLUMN_WIDTH, alignItems: 'center' }}>
      <Text variant="micro" color={theme.colors.textTertiary} style={{ marginBottom: 4 }}>
        {label}
      </Text>
      <View style={{ width: COLUMN_WIDTH, height: WHEEL_HEIGHT }}>
        {/* Selection band sits *under* the ScrollView so numbers stay crisp. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 2,
            right: 2,
            top: ITEM * 2,
            height: ITEM,
            borderRadius: theme.radii.sm,
            backgroundColor: theme.colors.accentSoft,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.colors.border,
          }}
        />
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          snapToInterval={ITEM}
          decelerationRate="fast"
          onScrollEndDrag={settle}
          onMomentumScrollEnd={settle}
          contentContainerStyle={{ paddingVertical: PAD }}
        >
          {Array.from({ length: count }, (_, value) => {
            const selected = value === index;
            return (
              <View
                key={value}
                style={{ height: ITEM, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text
                  style={{
                    fontSize: selected ? 17 : 14,
                    fontWeight: selected ? '800' : '500',
                    color: selected ? accent : theme.colors.textTertiary,
                    opacity: selected ? 1 : 0.55,
                  }}
                >
                  {`${value}`.padStart(2, '0')}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

interface TimeWheelsProps {
  /** Current duration in milliseconds — the single source of truth. */
  valueMs: number;
  /** Fires with the recomposed duration when any wheel settles on a value. */
  onValueChange: (ms: number) => void;
  /** Highlight colour — pass the ring colour so focus and break match. */
  accent?: string;
}

export function TimeWheels({ valueMs, onValueChange, accent }: TimeWheelsProps) {
  const theme = useTheme();
  const highlight = accent ?? theme.colors.accent;

  const hours = clamp(Math.floor(valueMs / 3_600_000), 0, 9);
  const minutes = Math.floor(valueMs / 60_000) % 60;
  const seconds = Math.floor(valueMs / 1000) % 60;

  const emit = (next: { hours?: number; minutes?: number; seconds?: number }) => {
    const h = next.hours ?? hours;
    const m = next.minutes ?? minutes;
    const s = next.seconds ?? seconds;
    onValueChange((h * 3600 + m * 60 + s) * 1000);
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}>
      <Column
        label="HOURS"
        count={10}
        index={hours}
        accent={highlight}
        onIndexChange={(value) => emit({ hours: value })}
      />
      <Column
        label="MINUTES"
        count={60}
        index={minutes}
        accent={highlight}
        onIndexChange={(value) => emit({ minutes: value })}
      />
      <Column
        label="SECONDS"
        count={60}
        index={seconds}
        accent={highlight}
        onIndexChange={(value) => emit({ seconds: value })}
      />
    </View>
  );
}
