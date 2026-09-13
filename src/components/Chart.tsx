import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { AnalyticsPoint } from '../types';
import { colors } from '../theme';

export function TrendChart({ data }: { data: AnalyticsPoint[] }) {
  const maxVal = Math.max(...data.map((d) => d.views));
  const minVal = Math.min(...data.map((d) => d.views));
  const range = maxVal - minVal || 1;

  const w = 320;
  const h = 180;
  const padX = 10;
  const padY = 20;

  const points = data.map((d, i) => {
    const x = padX + (i / (data.length - 1)) * (w - 2 * padX);
    const y = padY + (1 - (d.views - minVal) / range) * (h - 2 * padY);
    return { x, y, val: d.views, label: d.label };
  });

  const linePoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  // Simple quadratic curve through points
  const pathD = points.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = points[i - 1];
    const cpx = (prev.x + p.x) / 2;
    return acc + ` Q ${prev.x + (cpx - prev.x) * 0.5} ${prev.y} ${cpx} ${(prev.y + p.y) / 2} T ${p.x} ${p.y}`;
  }, '');

  return (
    <View style={styles.wrap}>
      <Svg width={w} height={h + 25}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const y = padY + (1 - frac) * (h - 2 * padY);
          const label = Math.round(minVal + frac * range);
          return (
            <React.Fragment key={frac}>
              <Line x1={padX} y1={y} x2={w - padX} y2={y} stroke={colors.line} strokeWidth={1} />
              <SvgText x={padX - 2} y={y + 3} fontSize={9} fill={colors.subtle} textAnchor="end">
                {label >= 1000 ? `${(label / 1000).toFixed(0)}k` : String(label)}
              </SvgText>
            </React.Fragment>
          );
        })}

        {/* Line */}
        <Path d={pathD} stroke={colors.accent} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />

        {/* Dots and labels */}
        {points.map((p, i) => (
          <React.Fragment key={i}>
            <Circle cx={p.x} cy={p.y} r={4} fill={colors.surface} stroke={colors.accent} strokeWidth={2} />
            <SvgText x={p.x} y={h + 18} fontSize={9} fill={colors.muted} textAnchor="middle">
              {p.label.replace('Oct ', '')}
            </SvgText>
          </React.Fragment>
        ))}
      </Svg>
    </View>
  );
}

// SVG Line helper
function Line({ x1, y1, x2, y2, stroke, strokeWidth }: { x1: number; y1: number; x2: number; y2: number; stroke: string; strokeWidth: number }) {
  return (
    <Polyline points={`${x1},${y1} ${x2},${y2}`} stroke={stroke} strokeWidth={strokeWidth} fill="none" strokeDasharray="4 6" />
  );
}

const styles = StyleSheet.create({ wrap: { marginHorizontal: -12 } });
