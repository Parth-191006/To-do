import React from 'react';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';

interface BrandMarkProps {
  size?: number;
  /**
   * Drop the tile and draw just the check — for places that already sit on a
   * coloured or branded surface.
   */
  bare?: boolean;
}

/**
 * The TaskFlow mark, drawn as vectors so it stays razor-sharp at any size and
 * tracks the active theme.
 *
 * It mirrors the generated launcher assets (`scripts/generate-logo.py`): a
 * rounded teal tile with a bold white check. In-app it uses the live accent
 * gradient rather than the icon's fixed one, which keeps it legible on both the
 * light and dark ramps.
 */
export function BrandMark({ size = 56, bare = false }: BrandMarkProps) {
  const theme = useTheme();
  // useId() contains characters (colons) that are illegal inside url(#…) refs.
  const gradientId = `tf-brand-${React.useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [from, to] = theme.colors.accentGradient;
  const contrast = bare ? theme.colors.accent : theme.colors.accentContrast;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>

      {bare ? null : <Rect x={0} y={0} width={100} height={100} rx={22.5} fill={`url(#${gradientId})`} />}

      <Path
        d="M28 52 L43 68 L74 34"
        stroke={contrast}
        strokeWidth={13}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
