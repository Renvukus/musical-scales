import type React from 'react';

/**
 * Returns pill color styles for an "in-fit" ratio (0..1, where 1 = 100% good).
 * High % stays calm neutral gray; as % approaches 0 it shifts smoothly to vivid red.
 */
export function getFitPillStyle(inRatio: number): React.CSSProperties {
  const clamped = Math.max(0, Math.min(1, inRatio));
  const badness = 1 - clamped;
  const sat = Math.round(6 + badness * 80);
  const light = Math.round(68 - badness * 6);
  const bgAlpha = (0.11 + badness * 0.14).toFixed(2);

  return {
    color: `hsl(4, ${sat}%, ${light}%)`,
    backgroundColor: `hsla(4, ${sat}%, 54%, ${bgAlpha})`,
  };
}

/**
 * Text-only color for compact inline fit percentages (e.g. section bar metadata).
 */
export function getFitTextColor(inRatio: number): string {
  const clamped = Math.max(0, Math.min(1, inRatio));
  const badness = 1 - clamped;
  const sat = Math.round(6 + badness * 80);
  const light = Math.round(66 - badness * 4);
  return `hsl(4, ${sat}%, ${light}%)`;
}
