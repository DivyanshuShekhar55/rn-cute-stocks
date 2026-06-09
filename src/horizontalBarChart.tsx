import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  withSpring,
  withTiming,
  useDerivedValue,
  DerivedValue,
  Easing,
  useAnimatedRef,
  useAnimatedScrollHandler,
  scrollTo,
} from "react-native-reanimated";
import React, { useState } from "react";
import { scaleBand, scaleLinear } from "d3-scale";
import { max } from "d3-array";
import { Canvas, Group, Rect, RoundedRect } from "@shopify/react-native-skia";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

// Types 

export interface BarDataItem {
  x: string; // category label — rendered on the left (y-axis side)
  y: number; // numeric value  — bars grow rightward
}

export type AnimationType = "spring" | "linear" | "none";

export interface SpringAnimationConfig {
  mass?: number;
  damping?: number;
  stiffness?: number;
}

export interface LinearAnimationConfig {
  duration?: number;
}

export type AnimationConfig = SpringAnimationConfig | LinearAnimationConfig;

interface HorizontalBarChartProps {
  width: number;
  height: number;
  data: BarDataItem[];
  color?: string;
  activeColor?: string;
  barGap?: number;
  bend?: number;
  numXLabels?: number;
  /** If true, bars scroll vertically; category labels stay sticky on left. Default: false */
  scrollable?: boolean;
  /** Minimum bar height in px when scrollable. Default: 25 */
  minBarHeight?: number;
  /** Tap animation type. Default: "spring" */
  animationType?: AnimationType;
  /**
   * Config passed to the animation driver.
   * For "spring": { mass, damping, stiffness }
   * For "linear": { duration }
   * Ignored when animationType is "none".
   */
  animationConfig?: AnimationConfig;
}

// Defaults

const DEFAULT_SPRING_CONFIG: Required<SpringAnimationConfig> = {
  mass: 1,
  damping: 5,
  stiffness: 150,
};

const DEFAULT_LINEAR_CONFIG: Required<LinearAnimationConfig> = {
  duration: 300,
};

const MIN_BAR_HEIGHT_DEFAULT = 25;

//  Component

const HorizontalBarChart = ({
  width,
  height,
  data,
  color = "#9672f8",
  activeColor = "#ff7e5f",
  barGap = 0.2,
  bend = 10,
  numXLabels = 3,
  scrollable = true,
  minBarHeight = MIN_BAR_HEIGHT_DEFAULT,
  animationType = "spring",
  animationConfig,
}: HorizontalBarChartProps): React.ReactElement => {

  const categoryLabels: string[] = data.map((d) => d.x);
  const values: number[]         = data.map((d) => d.y);
  const LabelCount               = data.length;

  // ── Axis dimensions ───────────────────────────────────────────────────────
  const xAxisHeight    = 0.1 * height;        // numeric tick label strip at top
  const yAxisWidth     = 0.18 * width;        // category label strip on left
  const chartWidth     = width - yAxisWidth;  // horizontal drawing area (bars)
  const fixedChartHeight = height - xAxisHeight; // vertical drawing area (viewport)

  const FONT_SIZE   = 12;
  const LINE_HEIGHT = FONT_SIZE * 1.2;
  const textOffset  = LINE_HEIGHT / 2;

  // ── Scales — always global across all data ────────────────────────────────

  const maxValue = max(values) || 1;

  // xScale: linear — maps 0→maxValue to 0→chartWidth (bars grow rightward)
  const xScale = scaleLinear<number, number>()
    .domain([0, maxValue])
    .range([0, chartWidth]);

  // Numeric tick marks along the top
  const xTicks: number[] = [0];
  for (let i = 1; i <= numXLabels; i++) {
    xTicks[i] = Math.round(i * (maxValue / numXLabels));
  }

  // yScale: band — maps category labels to vertical positions
  // In scrollable mode we expand chartHeight so each band >= minBarHeight
  const naturalBandHeight = (fixedChartHeight / LabelCount) * (1 - barGap);

  const chartHeight: number = (() => {
    if (!scrollable) return fixedChartHeight;
    if (naturalBandHeight >= minBarHeight) return fixedChartHeight;
    // back-calculate: bandHeight = total/LabelCount*(1-barGap)
    // => total = bandHeight * LabelCount / (1-barGap)
    return Math.ceil((minBarHeight * LabelCount) / (1 - barGap));
  })();

  const yScale = scaleBand<string>()
    .domain(categoryLabels)
    .range([0, chartHeight])
    .padding(barGap);

  const barHeight = yScale.bandwidth();

  // ── Interaction state ─────────────────────────────────────────────────────

  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // ── Scroll sync — UI thread, zero lag ─────────────────────────────────────
  // Mirrors the vertical chart's pattern exactly, just vertical instead of horizontal.
  // barScrollRef  → the canvas ScrollView the user actually scrolls
  // labelScrollRef → the category label ScrollView that follows passively
  const barScrollRef   = useAnimatedRef<Animated.ScrollView>();
  const labelScrollRef = useAnimatedRef<Animated.ScrollView>();

  const scrollY = useSharedValue<number>(0);

  // Worklet runs on UI thread — captures scroll offset and immediately drives
  // the label ScrollView to the same Y position with no JS bridge round-trip.
  const onBarScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      "worklet";
      scrollY.value = event.contentOffset.y;
      scrollTo(labelScrollRef, 0, scrollY.value, false);
    },
  });

  // ── Tap animation ─────────────────────────────────────────────────────────

  // scaleX instead of scaleY — bars are horizontal so they compress leftward
  const skiaScaleX = useSharedValue<number>(1);

  const skiaTransform: DerivedValue<{ scaleX: number }[]> = useDerivedValue(
    () => [{ scaleX: skiaScaleX.value }]
  );

  const tapGesture = Gesture.Tap()
    .runOnJS(true)
    .onStart((g) => {
      const touchY = g.y;
      // Inverse band lookup — which row does touchY fall in?
      const eachBandHeight = chartHeight / LabelCount;
      const clickedIndex   = Math.floor(touchY / eachBandHeight);

      if (clickedIndex >= 0 && clickedIndex < LabelCount) {
        setActiveIndex(activeIndex === clickedIndex ? null : clickedIndex);

        if (animationType === "none") return;

        skiaScaleX.value = 0.85; // snap compress leftward

        if (animationType === "spring") {
          const cfg = { ...DEFAULT_SPRING_CONFIG, ...(animationConfig as SpringAnimationConfig) };
          skiaScaleX.value = withSpring(1, cfg);
        } else {
          const cfg = { ...DEFAULT_LINEAR_CONFIG, ...(animationConfig as LinearAnimationConfig) };
          skiaScaleX.value = withTiming(1, {
            duration: cfg.duration,
            easing: Easing.out(Easing.quad),
          });
        }
      }
    });

  // ── Canvas ────────────────────────────────────────────────────────────────

  const renderCanvas = (): React.ReactElement => (
    <GestureDetector gesture={tapGesture}>
      <View style={{ width: chartWidth, height: chartHeight, position: "relative" }}>
        <Canvas style={StyleSheet.absoluteFill}>

          {/* Vertical grid lines at each numeric tick */}
          {xTicks.map((tick, i) => (
            <Rect
              key={`grid-${i}`}
              x={xScale(tick)}
              y={0}
              width={1}
              height={chartHeight}
              color="#666"
              opacity={0.15}
            />
          ))}

          {/* Bars */}
          {categoryLabels.map((label, index) => {
            const value          = values[index] ?? 0;
            const fullBarWidth   = xScale(value);
            const barTop         = yScale(label) ?? 0;
            const verticalOffset = (chartHeight / LabelCount - barHeight) / 2;
            const finalizedYPosition = barTop + verticalOffset;
            const isActive       = activeIndex === index;

            const roundedBarGeometry = {
              rect: {
                x: 0,
                y: finalizedYPosition,
                width: fullBarWidth,
                height: barHeight,
              },
              // Right corners rounded, left corners flat so they anchor to the axis
              topLeft:     { x: 0,    y: 0    },
              bottomLeft:  { x: 0,    y: 0    },
              topRight:    { x: bend, y: bend  },
              bottomRight: { x: bend, y: bend  },
            };

            return (
              <Group
                key={`bar-${index}`}
                // Origin at left edge centre — scaleX grows rightward from the axis wall
                origin={{ x: 0, y: finalizedYPosition + barHeight / 2 }}
                transform={isActive ? skiaTransform : undefined}
              >
                <RoundedRect
                  rect={roundedBarGeometry}
                  color={isActive ? activeColor : color}
                />
              </Group>
            );
          })}
        </Canvas>

        {/* Value bubble — floats just right of the active bar tip */}
        {activeIndex !== null && (() => {
          const activeItem = data[activeIndex];
          if (!activeItem) return null;
          const barTop         = yScale(activeItem.x) ?? 0;
          const verticalOffset = (chartHeight / LabelCount - barHeight) / 2;
          const finalizedYPosition = barTop + verticalOffset;
          const tipX           = xScale(activeItem.y);

          return (
            <View
              pointerEvents="none"
              style={[styles.valueBadge, {
                left: tipX + 6,
                top: finalizedYPosition + barHeight / 2 - 11,
              }]}
            >
              <Text style={styles.valueBadgeText}>{activeItem.y}</Text>
            </View>
          );
        })()}
      </View>
    </GestureDetector>
  );

  // ── Category label renderer ───────────────────────────────────────────────

  const renderCategoryLabels = (): React.ReactElement[] =>
    categoryLabels.map((label, index) => {
      const bh       = yScale.bandwidth();
      const isActive = activeIndex === index;
      return (
        <View
          key={label}
          style={{
            height: bh,
            justifyContent: "center",
            alignItems: "flex-end",
            paddingRight: 8,
            marginVertical: (chartHeight / LabelCount - bh) / 2,
          }}
        >
          <Text style={[styles.yAxisText, isActive ? styles.activeYAxisText : undefined]}>
            {label}
          </Text>
        </View>
      );
    });

  // ── Layout ────────────────────────────────────────────────────────────────

  return (
    <View style={{ width, height, marginTop: 50, marginLeft: 20 }}>

      {/* Sticky numeric (x) axis labels at top — these never scroll */}
      <View style={{ flexDirection: "row", height: xAxisHeight, marginLeft: yAxisWidth }}>
        {xTicks.map((tick, i) => (
          <Text
            key={i}
            style={[styles.xAxisText, { position: "absolute", left: xScale(tick) - textOffset }]}
          >
            {tick}
          </Text>
        ))}
      </View>

      {/* Main row: category labels + chart area */}
      <View style={{ flexDirection: "row", height: fixedChartHeight, overflow: "hidden" }}>

        {/* Category labels — sticky, driven by labelScrollRef on UI thread */}
        <Animated.ScrollView
          ref={labelScrollRef}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          style={{ width: yAxisWidth, height: fixedChartHeight }}
          contentContainerStyle={{ height: chartHeight }}
        >
          {renderCategoryLabels()}
        </Animated.ScrollView>

        {/* Chart area */}
        {scrollable ? (
          <Animated.ScrollView
            ref={barScrollRef}
            showsVerticalScrollIndicator={false}
            style={{ width: chartWidth, height: fixedChartHeight }}
            onScroll={onBarScroll}
            scrollEventThrottle={16}
          >
            {renderCanvas()}
          </Animated.ScrollView>
        ) : (
          renderCanvas()
        )}
      </View>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  xAxisText: {
    fontSize: 12,
    color: "#666",
    fontWeight: "600",
  },
  yAxisText: {
    fontSize: 12,
    color: "#666",
    textAlign: "right",
  },
  activeYAxisText: {
    color: "#000",
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

export default HorizontalBarChart;