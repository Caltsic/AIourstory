import { memo, useMemo } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Line, Polygon, Rect } from "react-native-svg";

import { useColors } from "@/hooks/use-colors";

type OverlayNode = { x: number; y: number; r: number };
type OverlayEdge = [number, number];

function buildHexPoints(cx: number, cy: number, radius: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i + Math.PI / 6;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    return `${x},${y}`;
  }).join(" ");
}

export const SentientTrailOverlay = memo(function SentientTrailOverlay() {
  const colors = useColors();
  const { width, height } = useWindowDimensions();

  const gridStep = Math.max(42, Math.round(Math.min(width, height) / 15));

  const verticalLines = useMemo(() => {
    const lines: number[] = [];
    for (let x = 0; x <= width + gridStep; x += gridStep) {
      lines.push(x);
    }
    return lines;
  }, [gridStep, width]);

  const horizontalLines = useMemo(() => {
    const lines: number[] = [];
    for (let y = 0; y <= height + gridStep; y += gridStep) {
      lines.push(y);
    }
    return lines;
  }, [gridStep, height]);

  const nodes = useMemo<OverlayNode[]>(
    () => [
      { x: width * 0.15, y: height * 0.22, r: 12 },
      { x: width * 0.34, y: height * 0.15, r: 14 },
      { x: width * 0.51, y: height * 0.32, r: 12 },
      { x: width * 0.72, y: height * 0.24, r: 13 },
      { x: width * 0.86, y: height * 0.42, r: 12 },
      { x: width * 0.2, y: height * 0.62, r: 14 },
      { x: width * 0.46, y: height * 0.73, r: 16 },
      { x: width * 0.77, y: height * 0.8, r: 14 },
    ],
    [height, width],
  );

  const edges = useMemo<OverlayEdge[]>(
    () => [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [0, 5],
      [5, 6],
      [6, 7],
      [2, 6],
      [3, 6],
    ],
    [],
  );

  const centerX = width * 0.5;
  const centerY = height * 0.52;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View
        style={[
          styles.washOrb,
          {
            top: height * 0.08,
            left: width * 0.02,
            backgroundColor: colors.primary,
          },
        ]}
      />
      <View
        style={[
          styles.washOrbSecondary,
          {
            top: height * 0.56,
            left: width * 0.58,
            backgroundColor: colors.border,
          },
        ]}
      />

      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        {verticalLines.map((x) => (
          <Line
            key={`vx-${x}`}
            x1={x}
            y1={0}
            x2={x}
            y2={height}
            stroke={colors.border}
            strokeOpacity={0.22}
            strokeWidth={1}
          />
        ))}

        {horizontalLines.map((y) => (
          <Line
            key={`hy-${y}`}
            x1={0}
            y1={y}
            x2={width}
            y2={y}
            stroke={colors.border}
            strokeOpacity={0.2}
            strokeWidth={1}
          />
        ))}

        {edges.map(([a, b]) => (
          <Line
            key={`edge-${a}-${b}`}
            x1={nodes[a].x}
            y1={nodes[a].y}
            x2={nodes[b].x}
            y2={nodes[b].y}
            stroke={colors.foreground}
            strokeOpacity={0.35}
            strokeWidth={1.4}
          />
        ))}

        {nodes.map((node, idx) => (
          <Polygon
            key={`node-${idx}`}
            points={buildHexPoints(node.x, node.y, node.r)}
            stroke={colors.primary}
            strokeOpacity={0.9}
            strokeWidth={1.4}
            fill={colors.surface}
            fillOpacity={0.86}
          />
        ))}

        <Line
          x1={centerX - 24}
          y1={centerY}
          x2={centerX + 24}
          y2={centerY}
          stroke={colors.primary}
          strokeOpacity={0.75}
          strokeWidth={1.4}
        />
        <Line
          x1={centerX}
          y1={centerY - 24}
          x2={centerX}
          y2={centerY + 24}
          stroke={colors.primary}
          strokeOpacity={0.75}
          strokeWidth={1.4}
        />

        <Rect
          x={width * 0.06}
          y={height * 0.11}
          width={width * 0.24}
          height={height * 0.16}
          stroke={colors.foreground}
          strokeOpacity={0.35}
          strokeWidth={1.2}
          fill="none"
        />
        <Rect
          x={width * 0.64}
          y={height * 0.64}
          width={width * 0.28}
          height={height * 0.2}
          stroke={colors.primary}
          strokeOpacity={0.45}
          strokeWidth={1.2}
          fill="none"
        />
      </Svg>

      <View
        style={[
          styles.metaCard,
          {
            top: 18,
            right: 14,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          },
        ]}
      >
        <Text style={[styles.metaText, { color: colors.muted }]}>
          GRID A-17 / NAV-031
        </Text>
      </View>

      <View
        style={[
          styles.metaCard,
          {
            bottom: 12,
            left: 14,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          },
        ]}
      >
        <Text style={[styles.metaText, { color: colors.muted }]}>
          X:{Math.round(width)} Y:{Math.round(height)} / TRACKING ONLINE
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  washOrb: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 160,
    opacity: 0.045,
  },
  washOrbSecondary: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    opacity: 0.065,
  },
  metaCard: {
    position: "absolute",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  metaText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
});
