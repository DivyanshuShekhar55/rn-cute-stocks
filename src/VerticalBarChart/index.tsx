import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  withSpring,
  useDerivedValue,
  withTiming,
  Easing,
  useAnimatedRef,
  useAnimatedScrollHandler,
  scrollTo,
} from "react-native-reanimated";
import type { DerivedValue } from "react-native-reanimated";
import React, { useState } from "react";
import { scaleBand, scaleLinear } from "d3-scale";
import { max } from "d3-array";
import { Canvas, Group, Rect, RoundedRect } from "@shopify/react-native-skia";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { LinearAnimationConfig, SpringAnimationConfig } from "../shared/types";
import { BarChartProps } from "./types";
import {
  DEFAULT_LINEAR_CONFIG,
  DEFAULT_SPRING_CONFIG,
} from "../shared/constants";

const MIN_BAR_WIDTH_DEFAULT = 25;

// Component
const VerticalBarChart = ({
  width,
  height,
  data,
  color = "#9672f8",
  activeColor = "#ff7e5f",
  barGap = 0.2, // ratio of area we would like to pad
  bend = 10,
  numYLabels = 3,
  labelFontColor = "#f0f0f0",
  labelActiveFontColor = "#fff",
  scrollable = false,
  minBarWidth = MIN_BAR_WIDTH_DEFAULT,
  animationType = "spring",
  animationConfig,
}: BarChartProps): React.ReactElement => {
  // we extract the x and y labels so this map operation isn't performed again and again
  const xAxisLabels = data.map((val) => val.x);
  const yAxisLabels = data.map((val) => val.y);
  const labelCount = data.length;

  // chart sizing
  const xAxisHeight = 0.1 * height;
  const yAxisWidth = 0.15 * width;
  const chartHeight = height - xAxisHeight;
  // chartWidth is derived below based on scrollable mode

  const FONT_SIZE = 12;
  const LINE_HEIGHT = FONT_SIZE * 1.2; // ~14.4 for font size=12
  const textOffset = LINE_HEIGHT / 2; // ~7

  // extract the max y value from data
  // we won't change the y-axis as user scrolls, keep it fixed between [0, maxValue]
  const maxValue = max(yAxisLabels) || 1;

  // Track which bar index is currently selected/active
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Grid line customization variables
  const GRID_LINE_COLOR = "#666";
  const GRID_LINE_OPACITY = 0.15;

  // user passes num of labels to show on y-axis
  // e.g. for 4 labels, we divide the y axis into 4 equal parts
  // between the range [0, maxValue]
  const yTicks: number[] = [0];
  for (let i = 1; i <= numYLabels; i++) {
    yTicks[i] = Math.round(i * (maxValue / numYLabels));
  }

  const yScale = scaleLinear<number, number>()
    .domain([0, maxValue])
    .range([chartHeight, 0]);

  // Chart width: in scrollable mode, expand to fit all bars
  // We compute the natural width a bar would get in the fixed layout,
  // then clamp it to minBarWidth so bars never get squeezed below threshold.
  const fixedChartWindow = width - yAxisWidth;
  const chartWidth: number = (() => {
    if (!scrollable) return fixedChartWindow;
    // how wide would each bar be if we used the fixed layout?
    // for example if bar gap is 20%, 20% slot of the bar's area would be for padding
    // so actual bar width would be 80% of the slot width (slot width = fixedChartWindow / labelCount)
    const naturalBandwidth = (fixedChartWindow / labelCount) * (1 - barGap);

    if (naturalBandwidth >= minBarWidth) {
      // All bars fit comfortably — no need to expand
      // area of chart same as fixedChartWindow
      return fixedChartWindow;
    }
    // Expand: give each bar exactly minBarWidth, back-calculate total canvas width
    // bandWidth = totalWidth/labelCount * (1 - barGap)  =>  totalWidth = bandWidth * labelCount / (1 - barGap)
    return Math.ceil((minBarWidth * labelCount) / (1 - barGap));
  })();

  const xScale = scaleBand<string>()
    .domain(xAxisLabels)
    .range([0, chartWidth])
    .padding(barGap);

  // Scroll sync
  // this is so that the x-axis also scrolls when the user scrolls bars
  // works only with scrollable = true
  // useAnimatedRef gives a handle to ScrollView that lives on the UI thread
  // a plain useRef would run on JS thread that might cause lag issues
  const barScrollRef = useAnimatedRef<Animated.ScrollView>();
  const labelScrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue<number>(0);

  // This handler is a worklet — it runs on the UI thread, not JS.
  // Every time the bar ScrollView moves, we capture the offset and immediately
  // call scrollTo on the label ScrollView. No JS bridge crossing = zero lag.
  const onBarScroll = useAnimatedScrollHandler({
    onScroll: (evt) => {
      "worklet";
      scrollX.value = evt.contentOffset.x;
      // scroll label strip: x = scroll offset, y = 0, animated = false (instant)
      scrollTo(labelScrollRef, scrollX.value, 0, false);
    },
  });

  // ── Tap animation ──────────────────────────────────────────────────────────

  const skiaScaleY = useSharedValue<number>(1);

  // Mounting Animation
  // bars grow from 0 to natural height
  // TODO

  // useDerivedValue so Skia's render thread reacts to the animated shared value
  const skiaTransform: DerivedValue<{ scaleY: number }[]> = useDerivedValue(
    () => [{ scaleY: skiaScaleY.value }],
  );

  // Detect gesture on a skia bar
  const tapGesture = Gesture.Tap()
    // Run lookup logic on the JS thread
    .runOnJS(true)
    .onStart((g) => {
      const touchX = g.x;

      // D3 Inverse Binary Lookup: Find which bar band contains the pixel coordinate touchX
      const eachBandWidth = chartWidth / data.length;
      const clickedIndex = Math.floor(touchX / eachBandWidth);

      if (clickedIndex >= 0 && clickedIndex < data.length) {
        // if the selected bar was already selected, unselect it (toggling), else select
        setActiveIndex(activeIndex === clickedIndex ? null : clickedIndex);

        // run the animation after selection
        if (animationType === "none") return;

        skiaScaleY.value = 0.85; // Snap compress down instantly

        if (animationType === "spring") {
          const cfg = {
            ...DEFAULT_SPRING_CONFIG, // first lay down all the default values
            ...(animationConfig as SpringAnimationConfig), // then overwrite with user provided values
          };
          skiaScaleY.value = withSpring(1, cfg);
        } else {
          // linear
          const cfg = {
            ...DEFAULT_LINEAR_CONFIG,
            ...(animationConfig as LinearAnimationConfig),
          };
          skiaScaleY.value = withTiming(1, {
            duration: cfg.duration,
            // TODO: should users have ability to choose easing too?
            easing: Easing.out(Easing.quad),
          });
        }
      }
    });

  const barWidth = xScale.bandwidth();

  // ── Canvas ─────────────────────────────────────────────────────────────────
  // we extract the section containing bars and grid lines (skia part) here
  // we can place them inside a normal View or ScrollView based on scrollable prop's value
  const renderCanvas = (): React.ReactElement => (
    <GestureDetector gesture={tapGesture}>
      <View
        style={{
          width: chartWidth,
          height: chartHeight,
          position: "relative",
        }}
      >
        <Canvas style={StyleSheet.absoluteFill}>
          {yTicks.map((tick, i) => (
            <Rect
              key={`grid-${i}`}
              x={0}
              y={yScale(tick)}
              width={chartWidth}
              height={1}
              color={GRID_LINE_COLOR}
              opacity={GRID_LINE_OPACITY}
            />
          ))}

          {/* BARS */}
          {xAxisLabels.map((label, index) => {
            const value = yAxisLabels[index] || 0;
            const barHeight = chartHeight - yScale(value);
            const barLeft = xScale(label) || 0;
            const barWidth = xScale.bandwidth();
            const isActive = activeIndex === index;

            // if we just position the rect at `barLeft` it would look misaligned wrt to x labels
            // this is because we haven't yet applied the margins on left
            // chartWidth/labelCount will give us the total area (including padding, as D3 calculated) for a bar
            // subtracting bar width gives us total padding/margin to be applied
            // dividing gives padding to be applied on left and the right (equal padding both sides)
            const horizontalOffset = (chartWidth / labelCount - barWidth) / 2;
            const finalizedXPosition = barLeft + horizontalOffset;

            // Define the Rounded Rect boundary definition object
            const roundedBarGeometry = {
              rect: {
                x: finalizedXPosition,
                y: chartHeight - barHeight,
                width: barWidth,
                height: barHeight,
              },
              // Top corners receive your smooth bend radii values
              topLeft: { x: bend, y: bend },
              topRight: { x: bend, y: bend },
              // Bottom corners stay flat (0) so they anchor cleanly to the baseline floor
              bottomRight: { x: 0, y: 0 },
              bottomLeft: { x: 0, y: 0 },
            };

            return (
              // transform uses useDerivedValue (skiaTransform) so Skia animates on render thread
              <Group
                key={`bar-${index}`}
                // move the origin to base of the skia bar
                // finalizedXPosition is where the left of bar must be, add barWidth/2 to move to center of bar
                // keeping y:chartHeight keeps it at the bottom of bar so scaleY grows upward only
                origin={{
                  x: finalizedXPosition + barWidth / 2,
                  y: chartHeight,
                }}
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

        {/* floating value bubble — placed over the active index bar */}
        {/* the logic for these calculations is explained above in drawing the bars */}
        {activeIndex !== null &&
          (() => {
            const activeItem = data[activeIndex];
            if (!activeItem) return null; // narrow the type

            const barWidth = xScale.bandwidth();
            const barLeft = xScale(activeItem.x) || 0;
            const horizontalOffset = (chartWidth / labelCount - barWidth) / 2;
            const finalizedXPosition = barLeft + horizontalOffset;
            const barHeight = chartHeight - yScale(activeItem.y);

            return (
              <View
                pointerEvents="none" // Ensure overlay bubble doesn't block underlying canvas click handlers
                style={[
                  styles.valueBadge,
                  {
                    left: finalizedXPosition + barWidth / 2 - 20, // Center bubble over active index width
                    top: chartHeight - barHeight - 32, // Float cleanly above the bar top edge
                  },
                ]}
              >
                <Text style={styles.valueBadgeText}>{activeItem.y}</Text>
              </View>
            );
          })()}
      </View>
    </GestureDetector>
  );

  // ── Layout ─────────────────────────────────────────────────────────────────
  return (
    <View style={{ width, height, marginTop: 50, marginLeft: 20 }}>
      {/* CHART AREA: y-axis labels + bars side by side */}
      <View style={{ flexDirection: "row", height: chartHeight }}>
        {/* Y-AXIS LABELS — absolutely positioned within chartHeight */}
        <View
          style={{
            width: yAxisWidth,
            height: chartHeight,
            position: "relative",
          }}
        >
          {yTicks.map((label, i) => (
            <Text
              key={i}
              style={[
                styles.yAxisText,
                {
                  position: "absolute",
                  top: yScale(label) - textOffset,
                  right: 8,
                  color: labelFontColor,
                },
              ]}
            >
              {label}
            </Text>
          ))}
        </View>

        {/* Plug in the canvas view here */}
        {scrollable ? (
          // Must be Animated.ScrollView (not RN's ScrollView) so that
          // useAnimatedRef and useAnimatedScrollHandler can attach on the UI thread.
          <Animated.ScrollView
            ref={barScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ width: fixedChartWindow }}
            onScroll={onBarScroll}
            // scrollEventThrottle has no effect on Reanimated handlers (they run
            // every frame on the UI thread regardless), but RN requires it to be
            // set to avoid a warning. 16 is the conventional value (~60fps).
            scrollEventThrottle={16}
          >
            {renderCanvas()}
          </Animated.ScrollView>
        ) : (
          renderCanvas()
        )}
      </View>

      {scrollable ? (
        <Animated.ScrollView
          ref={labelScrollRef}
          horizontal
          // User cannot scroll this manually — it is driven exclusively by
          // the scrollTo call inside onBarScroll on the UI thread.
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          style={{ marginLeft: yAxisWidth, width: fixedChartWindow }}
          contentContainerStyle={{ flexDirection: "row" }}
        >
          {renderXLabels()}
        </Animated.ScrollView>
      ) : (
        <View style={{ flexDirection: "row", marginLeft: yAxisWidth }}>
          {renderXLabels()}
        </View>
      )}
    </View>
  );

  function renderXLabels(): React.ReactElement[] {
    return xAxisLabels.map((label, index) => {
      const bw = xScale.bandwidth();
      const isActive = activeIndex === index;
      return (
        <View
          key={label}
          style={{
            width: chartWidth / labelCount ,
            alignItems: "center",
            // the below might be causing the weird label alignment 
            // marginHorizontal: (chartWidth / labelCount - bw) / 2,
          }}
        >
          <Text
            style={[
              styles.xAxisText,
              isActive
                ? [styles.activeXAxisText, { color: labelActiveFontColor }]
                : undefined,
            ]}
          >
            {label}
          </Text>
        </View>
      );
    });
  }
};

// ─── Styles ───────────────────────────────────────────────────────────────────

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
    elevation: 3, // Android shadow safety pass
  },
  valueBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "bold",
  },
});

export default VerticalBarChart;
