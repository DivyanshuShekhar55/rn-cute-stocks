/*
  NOTE FOR CONTRIBUTORS :
  Please Read Horizontal Bar chart component before reading vertical chart component.
  Both the charts foolow the same architecture and contain almost similar code.
  Horizontal Bar Chart is more technically documented and explained, the same reasoning maps to Vertical chart component.
 */

import { View, Text, StyleSheet, Platform } from "react-native";
import {
  useSharedValue,
  withSpring,
  withTiming,
  withDecay,
  useDerivedValue,
  useAnimatedReaction,
  Easing,
} from "react-native-reanimated";
import type { DerivedValue } from "react-native-reanimated";
import React, { useState } from "react";
import { scaleBand, scaleLinear } from "../math/scale";
import { max } from "../math/array/minMax";
import {
  Canvas,
  Group,
  Rect,
  RoundedRect,
  Text as SkiaText,
  matchFont,
  rect,
  rrect,
} from "@shopify/react-native-skia";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import { LinearAnimationConfig, SpringAnimationConfig } from "../shared/types";
import { BarChartProps } from "./types";
import {
  DEFAULT_LINEAR_CONFIG,
  DEFAULT_SPRING_CONFIG,
} from "../shared/constants";

const MIN_BAR_WIDTH_DEFAULT = 25;

const fontFamily = Platform.select({ ios: "Helvetica", default: "serif" });

/**
 * Renders a horizontally-laid-out, vertically-growing bar chart.
 */
const VerticalBarChart = ({
  width,
  height,
  data,
  color = "#9672f8",
  activeColor = "#ff7e5f",
  barGap = 0.2,
  bend = 10,
  numYLabels = 3,
  fontSize = 12,
  labelFontColor = "#f0f0f0",
  labelActiveFontColor = "#fff",
  badgeBackgroundColor = "#333",
  badgeFontColor = "#fff",
  scrollable = true,
  minBarWidth = MIN_BAR_WIDTH_DEFAULT,
  xLabelHeight = 0.1,
  yLabelWidth = 0.2,
  animationType = "spring",
  animationConfig,
  jsThrottleMs = 100,
}: BarChartProps): React.ReactElement => {
  // Text init
  const font = React.useMemo(
    () =>
      matchFont({
        fontFamily,
        fontSize,
        fontStyle: "italic",
        fontWeight: "bold",
      }),
    [fontSize],
  );

  // memoized so a scroll-triggered re-render doesn't rebuild these arrays —
  const xAxisLabels = React.useMemo(() => data.map((d) => d.x), [data]);
  const yAxisLabels = React.useMemo(() => data.map((d) => d.y), [data]);
  const labelCount = data.length;

  // ── Axis dimensions ───────────────────────────────────────────────────────
  const xAxisHeight = xLabelHeight * height; // numeric tick label strip — kept as plain RN Text since it never scrolls
  const yAxisWidth = yLabelWidth * width;
  const fixedChartWidth = width - yAxisWidth; // visible viewport width (NOT the full scrollable width)
  const chartHeight = height - xAxisHeight;

  const LINE_HEIGHT = fontSize * 1.2;
  const textOffset = LINE_HEIGHT / 2;

  // category labels now live INSIDE the canvas (drawn in Skia, below the
  // bars) instead of in a separate row below it — so chartHeight itself
  // needs to set aside a strip for them. Bars only get to use the
  // remaining space, barAreaHeight, not the full chartHeight.
  // barAreaHeight is like the baseline pixel where bars start (their bottom)
  const LABEL_AREA_HEIGHT = fontSize + 8;
  const barAreaHeight = chartHeight - LABEL_AREA_HEIGHT;

  const maxValue = React.useMemo(() => max(yAxisLabels) || 1, [yAxisLabels]);

  // y-axis stays fixed regardless of scroll — only x scrolls in this chart
  const yScale = React.useMemo(
    () => scaleLinear().domain([0, maxValue]).range([barAreaHeight, 0]),
    [maxValue, barAreaHeight],
  );

  const GRID_LINE_COLOR = "#666";
  const GRID_LINE_OPACITY = 0.15;

  const yTicks: number[] = [0];
  for (let i = 1; i <= numYLabels; i++) {
    yTicks[i] = Math.round(i * (maxValue / numYLabels));
  }

  // chartWidth is the LOGICAL full width of all bars laid out — used only to
  // clamp scroll bounds and size xScale's range. The Canvas itself is NEVER
  // sized to this — it always stays fixedChartWidth wide. A canvas sized to
  // fit some hundreds of bars can exceed the device's GPU surface limit and crash
  const naturalBandwidth = (fixedChartWidth / labelCount) * (1 - barGap);
  const chartWidth: number = (() => {
    if (!scrollable) return fixedChartWidth;
    if (naturalBandwidth >= minBarWidth) return fixedChartWidth;
    return Math.ceil((minBarWidth * labelCount) / (1 - barGap));
  })();

  const maxScroll = Math.max(0, chartWidth - fixedChartWidth);

  const xScale = React.useMemo(
    () =>
      scaleBand<string>()
        .domain(xAxisLabels)
        .range([0, chartWidth])
        .paddingInner(barGap)
        .paddingOuter(barGap/2),
    [xAxisLabels, chartWidth, barGap],
  );
  const barWidth = xScale.bandwidth();
  const eachBandWidth = chartWidth / labelCount;

  // ── Scroll — a shared value driven directly by Pan. No ScrollView at all. ─
  // Same architecture as the horizontal bar chart: one gesture system (Gesture
  // Handler) owns both tap and scroll, so there's no native ScrollView fighting
  // a separate GestureDetector for the same touch.
  const scrollX = useSharedValue(0);
  const startScrollX = useSharedValue(0);
  const lastSyncTime = useSharedValue(0);

  // Mirrored into JS state ONLY for the visible-slice math below. Updated via
  // a throttled bridge call, NOT every frame — syncing on every frame (60/sec)
  // floods the JS thread with state updates and tanks JS FPS even though the
  // actual bar positions (driven by the shared value, UI thread) stay smooth.
  const [scrollOffset, setScrollOffset] = useState(0);
  const syncScrollToJS = (val: number) => setScrollOffset(val);

  useAnimatedReaction(
    () => scrollX.value,
    (current) => {
      const now = Date.now();
      if (now - lastSyncTime.value > jsThrottleMs) {
        lastSyncTime.value = now;
        scheduleOnRN(syncScrollToJS, current);
      }
    },
  );

  // ── Interaction state ─────────────────────────────────────────────────────
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // ── Tap animation ─────────────────────────────────────────────────────────
  const skiaScaleY = useSharedValue<number>(1);
  const skiaTransform: DerivedValue<{ scaleY: number }[]> = useDerivedValue(
    () => [{ scaleY: skiaScaleY.value }],
  );

  // Runs on JS thread (called via scheduleOnRN below) — it touches React
  // state and spreads animation config objects
  const handleTap = (touchX: number, currentScroll: number) => {
    const touchXAbs = touchX + currentScroll;
    const clickedIndex = Math.floor(touchXAbs / eachBandWidth);

    if (clickedIndex >= 0 && clickedIndex < labelCount) {
      setActiveIndex((prev) => (prev === clickedIndex ? null : clickedIndex));
      if (animationType === "none") return;

      skiaScaleY.value = 0.85; // snap compress down instantly
      if (animationType === "spring") {
        const cfg = {
          ...DEFAULT_SPRING_CONFIG,
          ...(animationConfig as SpringAnimationConfig),
        };
        skiaScaleY.value = withSpring(1, cfg);
      } else {
        const cfg = {
          ...DEFAULT_LINEAR_CONFIG,
          ...(animationConfig as LinearAnimationConfig),
        };
        skiaScaleY.value = withTiming(1, {
          duration: cfg.duration,
          easing: Easing.out(Easing.quad),
        });
      }
    }
  };

  // UI thread reads where the touch landed and the current scroll position,
  // then hands off to JS thread for everything state/animation-related.
  const tapGesture = Gesture.Tap().onStart((g) => {
    "worklet";
    scheduleOnRN(handleTap, g.x, scrollX.value);
  });

  const panGesture = Gesture.Pan()
    .onStart(() => {
      "worklet";
      // remember where scroll was BEFORE this drag, since onUpdate only
      // reports movement relative to touch-down, not an absolute position
      startScrollX.value = scrollX.value;
    })
    .onUpdate((e) => {
      "worklet";
      // dragging right (translationX positive) should reveal content to the
      // LEFT — i.e. scroll position decreases
      const next = startScrollX.value - e.translationX;
      scrollX.value = Math.max(0, Math.min(maxScroll, next));
    })
    .onEnd((e) => {
      "worklet";
      // let go of the drag, and the scroll keeps gliding based on how fast
      // the finger was moving at release, gradually slowing down (friction)
      // instead of stopping dead the instant the finger lifts
      scrollX.value = withDecay(
        { velocity: -e.velocityX, clamp: [0, maxScroll] },
        () => {
          // decay has fully settled — do one final JS sync so the rendered
          // bar window matches the exact resting position, since the
          // throttle above might leave it slightly stale otherwise
          scheduleOnRN(syncScrollToJS, scrollX.value);
        },
      );
    });

  // Only one of tap or pan can become active per touch — Gesture Handler
  // itself decides which, based on whether the finger moved or stayed still.
  // Pan is listed first, giving it priority if both could plausibly apply.
  const composedGesture = Gesture.Exclusive(panGesture, tapGesture);

  // pre-measure all label widths once per data change, not once per bar per render
  const labelWidths = React.useMemo(
    () => xAxisLabels.map((label) => (font ? font.getTextWidth(label) : 0)),
    [xAxisLabels, font],
  );

  // ── Canvas — ALWAYS fixedChartWidth wide, regardless of data length ───────
  const renderCanvas = (): React.ReactElement => {
    // figure out which bars are actually inside the visible window right
    // now, plus a small buffer (±2 bars) so bars don't visibly pop in/out
    // right at the screen edge when we scroll
    const firstVisibleIndex = Math.max(
      0,
      Math.floor(scrollOffset / eachBandWidth) - 2,
    );
    const visibleCount = Math.ceil(fixedChartWidth / eachBandWidth) + 4;
    const lastVisibleIndex = Math.min(
      labelCount,
      firstVisibleIndex + visibleCount,
    );

    return (
      <GestureDetector gesture={composedGesture}>
        <View
          style={{
            width: fixedChartWidth,
            height: chartHeight,
            position: "relative",
          }}
        >
          <Canvas style={StyleSheet.absoluteFill}>
            {/* horizontal grid lines at each numeric tick — fixed, never scroll */}
            {yTicks.map((tick, i) => (
              <Rect
                key={`grid-${i}`}
                x={0}
                y={yScale(tick)}
                width={fixedChartWidth}
                height={1}
                color={GRID_LINE_COLOR}
                opacity={GRID_LINE_OPACITY}
              />
            ))}

            {/* only slice + map the visible window, not the full dataset —
                this is the actual virtualisation: at 1000+ bars we still
                only ever create a couple dozen Skia nodes per render */}
            {xAxisLabels
              .slice(firstVisibleIndex, lastVisibleIndex)
              .map((label, i) => {
                const index = firstVisibleIndex + i; // real index into full data
                const value = yAxisLabels[index] ?? 0;

                // make bar height=0 for bad data points
                const yScaleVal = yScale(value);
                const barHeight =
                  yScaleVal === undefined ? 0 : barAreaHeight - yScaleVal;

                // bar's true position in the FULL (unwindowed) data space,
                // then shift left by scrollOffset to land in the viewport
                const barLeft = (xScale(label) ?? 0) - scrollOffset;
                const horizontalOffset = (eachBandWidth - barWidth) / 2;
                const finalizedXPosition = barLeft + horizontalOffset;
                const isActive = activeIndex === index;

                const roundedBarGeometry = {
                  rect: {
                    x: finalizedXPosition,
                    y: barAreaHeight - barHeight,
                    width: barWidth,
                    height: barHeight,
                  },
                  // top corners rounded, bottom corners flat so bars anchor
                  // cleanly to the baseline floor
                  topLeft: { x: bend, y: bend },
                  topRight: { x: bend, y: bend },
                  bottomRight: { x: 0, y: 0 },
                  bottomLeft: { x: 0, y: 0 },
                };

                // right-aligned-style centering for the label under the bar
                const labelTextWidth = labelWidths[index] ?? 0;
                const labelX =
                  finalizedXPosition + barWidth / 2 - labelTextWidth / 2;
                const labelY = barAreaHeight + fontSize + 2; // just below the bar baseline, now inside the canvas's own height

                return (
                  <Group key={`bar-${index}`}>
                    {/* inner Group exists ONLY so skiaTransform (the tap
                      "squish" animation) affects the bar alone, not the
                      label drawn alongside it */}
                    <Group
                      origin={{
                        x: finalizedXPosition + barWidth / 2,
                        y: barAreaHeight,
                      }}
                      transform={isActive ? skiaTransform : undefined}
                    >
                      <RoundedRect
                        rect={roundedBarGeometry}
                        color={isActive ? activeColor : color}
                      />
                    </Group>

                    {/* category label, drawn in Skia (not RN <Text>) so it
                      lives in the same canvas/coordinate space as the bar —
                      no separate scroll view or sync mechanism needed */}
                    {font && (
                      <SkiaText
                        x={labelX}
                        y={labelY}
                        text={label}
                        font={font}
                        color={isActive ? labelActiveFontColor : labelFontColor}
                      />
                    )}
                    {/* value badge — only on the active/selected bar */}
                    {/* we show the value badge at 70% lenggth of the active bar, not at top, else for max bars it would cut off */}
                    {isActive &&
                      font &&
                      (() => {
                        const valueStr = value.toFixed(2);
                        const badgeTextWidth = font.getTextWidth(valueStr);
                        const badgePaddingX = 6;
                        const badgePaddingY = 3;
                        const badgeWidth = badgeTextWidth + badgePaddingX * 2;
                        const badgeHeight = fontSize + badgePaddingY * 2;

                        const badgeY = barAreaHeight - barHeight * 0.7; // 70% of height
                        const badgeX =
                          finalizedXPosition + barWidth / 2 - badgeWidth / 2;

                        return (
                          <Group key={`badge-${index}`}>
                            <RoundedRect
                              // ((x, y, width, height), rx, ry)
                              rect={rrect(
                                rect(
                                  badgeX,
                                  badgeY - badgeHeight / 2,
                                  badgeWidth,
                                  badgeHeight,
                                ),
                                4,
                                4,
                              )}
                              color={badgeBackgroundColor}
                            />
                            <SkiaText
                              x={badgeX + badgePaddingX}
                              y={
                                badgeY -
                                badgeHeight / 2 +
                                badgeHeight -
                                badgePaddingY -
                                2
                              }
                              text={valueStr}
                              font={font}
                              color={badgeFontColor}
                            />
                          </Group>
                        );
                      })()}
                  </Group>
                );
              })}
          </Canvas>
        </View>
      </GestureDetector>
    );
  };

  // ── Layout ────────────────────────────────────────────────────────────────
  return (
    <View style={{ width, height, marginTop: 50, marginLeft: 20 }}>
      <View style={{ flexDirection: "row", height: chartHeight }}>
        {/* y-axis numeric labels — fixed, plain RN Text, never scrolls */}
        <View
          style={{
            width: yAxisWidth,
            height: chartHeight,
            position: "relative",
          }}
        >
          {yTicks.map((label, i) => {
            const yScaleVal = yScale(label);

            // return no text for bad data points
            if (yScaleVal === undefined) return null;
            return (
              <Text
                key={i}
                style={[
                  styles.yAxisText,
                  {
                    position: "absolute",
                    top: yScaleVal - textOffset,
                    right: 8,
                    color: labelFontColor,
                  },
                ]}
              >
                {label}
              </Text>
            );
          })}
        </View>

        <View
          style={{
            width: fixedChartWidth,
            height: chartHeight,
            overflow: "hidden",
          }}
        >
          {renderCanvas()}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  yAxisText: {
    fontSize: 12,
    fontWeight: "600",
  },
  xAxisText: {
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
  },
  activeXAxisText: {
    fontWeight: "bold",
  },
  valueBadge: {
    position: "absolute",
    backgroundColor: "#333",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    zIndex: 10,
    elevation: 3,
  },
  valueBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "bold",
  },
});

export default VerticalBarChart;
