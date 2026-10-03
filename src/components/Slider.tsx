import React, { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, View, type LayoutChangeEvent } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

/**
 * Manual duration slider — the focus timer's alternative to its preset chips,
 * so any length can be dialed in by sliding instead of tapping.
 *
 * Built on PanResponder like every other gesture in this app (see
 * ARCHITECTURE.md), so no native slider dependency joins the managed workflow.
 *
 * Behaviour:
 *  - A press only becomes a slide after the finger moves a few pixels
 *    horizontally, so a tap near the preset chips never changes the timer and
 *    vertical drags still scroll the page.
 *  - The caller's `value` is the single source of truth for the thumb: values
 *    commit while sliding, which keeps the readout and preset chips in sync
 *    the whole way.
 */

const THUMB = 22;
const TRACK_HEIGHT = 6;
const SLIDER_HEIGHT = 40;
/** Horizontal travel (px) before a press is treated as a deliberate slide. */
const SLIDE_THRESHOLD = 4;

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Fired with the new, stepped value each time the slide crosses one. */
  onValueChange: (value: number) => void;
  /** Fill + thumb colour — pass the mode colour so focus and break match. */
  activeColor: string;
  accessibilityLabel?: string;
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onValueChange,
  activeColor,
  accessibilityLabel,
}: SliderProps) {
  const theme = useTheme();

  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);

  const widthRef = useRef(0);
  /** Mirrors the latest committed value so duplicate emissions are skipped. */
  const valueRef = useRef(value);
  valueRef.current = value;
  /** X (in track coordinates) where the slide began, before any movement. */
  const startXRef = useRef(0);
  const changeRef = useRef(onValueChange);
  changeRef.current = onValueChange;

  const stepTo = useCallback(
    (raw: number) => {
      const stepped = Math.round((raw - min) / step) * step + min;
      return Math.min(max, Math.max(min, stepped));
    },
    [max, min, step],
  );

  /** Maps an x inside the track to the nearest stepped value. */
  const valueAt = useCallback(
    (x: number) => {
      const usable = widthRef.current - THUMB;
      if (usable <= 0) return min;
      const ratio = Math.min(1, Math.max(0, (x - THUMB / 2) / usable));
      return stepTo(min + ratio * (max - min));
    },
    [max, min, stepTo],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Claim only deliberate horizontal slides: taps do nothing and
        // vertical drags stay with the page's ScrollView.
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > SLIDE_THRESHOLD && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: (event, gesture) => {
          // gesture.dx is measured from touch-down, so rewind it to recover
          // the x the slide started from.
          startXRef.current = event.nativeEvent.locationX - gesture.dx;
          setDragging(true);
        },
        onPanResponderMove: (_event, gesture) => {
          const next = valueAt(startXRef.current + gesture.dx);
          if (next === valueRef.current) return;
          valueRef.current = next;
          changeRef.current(next);
        },
        onPanResponderRelease: () => setDragging(false),
        onPanResponderTerminate: () => setDragging(false),
      }),
    [valueAt],
  );

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    widthRef.current = nextWidth;
    setWidth(nextWidth);
  }, []);

  const ratio = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
  const usable = Math.max(0, width - THUMB);
  // Thumb centre, inset by its radius so it never overflows the track ends.
  const thumbCenter = THUMB / 2 + ratio * usable;

  return (
    <View
      onLayout={onLayout}
      collapsable={false}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityActions={[
        { name: 'increment', label: 'Increase' },
        { name: 'decrement', label: 'Decrease' },
      ]}
      onAccessibilityAction={(event) => {
        const action = event.nativeEvent.actionName;
        if (action !== 'increment' && action !== 'decrement') return;
        const next = stepTo(value + (action === 'increment' ? step : -step));
        if (next === value) return;
        onValueChange(next);
      }}
      accessibilityValue={{ min, max, now: value, text: `${value} minutes` }}
      style={{ height: SLIDER_HEIGHT, justifyContent: 'center' }}
      {...panResponder.panHandlers}
    >
      {/* Track + fill are non-interactive so every touch lands on the
          container and locationX is measured against the full track. */}
      <View
        pointerEvents="none"
        style={{
          height: TRACK_HEIGHT,
          borderRadius: TRACK_HEIGHT / 2,
          backgroundColor: theme.colors.surfaceSunken,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: thumbCenter,
            borderRadius: TRACK_HEIGHT / 2,
            backgroundColor: activeColor,
          }}
        />
      </View>

      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: thumbCenter - THUMB / 2,
          top: (SLIDER_HEIGHT - THUMB) / 2,
          width: THUMB,
          height: THUMB,
          borderRadius: THUMB / 2,
          backgroundColor: activeColor,
          borderWidth: 3,
          borderColor: theme.colors.background,
          transform: [{ scale: dragging ? 1.15 : 1 }],
          shadowColor: theme.colors.shadow,
          shadowOpacity: 0.35,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 1 },
          elevation: 2,
        }}
      />
    </View>
  );
}
