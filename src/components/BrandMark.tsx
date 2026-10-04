import React from 'react';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';
import { brand } from '@/theme/tokens';

interface BrandMarkProps {
  size?: number;
  /**
   * Drop the tile and draw just the character — for places that already sit on
   * a coloured or branded surface.
   */
  bare?: boolean;
}

/** Shared with `scripts/generate-logo.py` through `brand` in the tokens file. */
const OUTLINE = brand.outline;
const FACE = brand.face;
const BLUSH = brand.blush;
const SPARKLE = '#FFFFFF';

/**
 * The TaskFlow mascot — a chunky, smiling checkmark — drawn as vectors so it
 * stays sharp at any size and tracks the active theme.
 *
 * It is deliberately the *same character* as the generated launcher assets in
 * `scripts/generate-logo.py`: rounded tick, thick soft outline, eyes, smile,
 * blush and a sparkle. If one changes, the other has to change with it —
 * `scripts/verify-brand.py` asserts the raster side, and this component is the
 * vector side used on screen.
 */
export function BrandMark({ size = 56, bare = false }: BrandMarkProps) {
  const theme = useTheme();
  // useId() contains characters (colons) that are illegal inside url(#…) refs.
  const gradientId = `tf-brand-${React.useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [from, to] = theme.colors.accentGradient;

  // On the tile the character keeps the icon's fixed colours; bare, it borrows
  // the theme accent so it stays legible on whatever surface it sits on.
  const body = bare ? theme.colors.accent : '#FFFFFF';
  const outline = bare ? theme.colors.accent : OUTLINE;
  const face = bare ? theme.colors.accentContrast : FACE;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>

      {bare ? null : <Rect x={0} y={0} width={100} height={100} rx={22.5} fill={`url(#${gradientId})`} />}

      {/* Sparkle — the "just finished it" glint, top right. */}
      <Path
        d="M74.5 20 H83.5 M79 15.5 V24.5"
        stroke={SPARKLE}
        strokeWidth={2}
        strokeLinecap="round"
        opacity={bare ? 0 : 0.92}
      />
      {bare ? null : <Circle cx={79} cy={20} r={1.6} fill={SPARKLE} opacity={0.95} />}

      {/* The tick: a dark, thicker stroke underneath gives the soft outline. */}
      <Path
        d="M16 52 L40 74 L86 26"
        stroke={outline}
        strokeWidth={34}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M16 52 L40 74 L86 26"
        stroke={body}
        strokeWidth={30}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Blush, then the face on top of it. */}
      {bare ? null : (
        <>
          <Circle cx={44} cy={45.5} r={2.9} fill={BLUSH} opacity={0.28} />
          <Circle cx={64} cy={45.5} r={2.9} fill={BLUSH} opacity={0.28} />
        </>
      )}
      <Circle cx={48.5} cy={39.5} r={2.6} fill={face} />
      <Circle cx={58.5} cy={39.5} r={2.6} fill={face} />
      <Path
        d="M52.8 43.6 Q55.6 47 58.4 43.6"
        stroke={face}
        strokeWidth={2.2}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}
