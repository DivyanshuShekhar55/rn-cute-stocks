import { View, Text, StyleSheet, Platform } from "react-native";
import {
  useSharedValue,
  withSpring,
  withTiming,
  useDerivedValue,
  DerivedValue,
  Easing,
  withDecay,
  useAnimatedReaction,
} from "react-native-reanimated";
import React, { useState } from "react";
import { scaleBand, scaleLinear } from "../math/scale";
import { max } from "../math/array/minMax";
import {
  Canvas,
  Group,
  matchFont,
  rect,
  Rect,
  RoundedRect,
  rrect,
  Text as SkiaText,
} from "@shopify/react-native-skia";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { LinearAnimationConfig, SpringAnimationConfig } from "../shared/types";
import { HorizontalBarChartProps } from "./types";
import {
  DEFAULT_LINEAR_CONFIG,
  DEFAULT_SPRING_CONFIG,
} from "../shared/constants";
import { scheduleOnRN } from "react-native-worklets";

const MIN_BAR_HEIGHT_DEFAULT = 25;

const fontFamily = Platform.select({ ios: "Helvetica", default: "serif" });

const HorizontalBarChart = ({
  width,
  height,
  data,
  color = "#9672f8",
  activeColor = "#ff7e5f",
  barGap = 0.2,
  bend = 10,
  numXLabels = 3,
  fontSize = 12,
  labelFontColor = "#f0f0f0",
  labelActiveFontColor = "#fff",
  badgeBackgroundColor = "#333",
  badgeFontColor = "#fff",
  scrollable = true,
  minBarHeight = MIN_BAR_HEIGHT_DEFAULT,
  xLabelHeight = 0.1,
  yLabelWidth = 0.2,
  animationType = "spring",
  animationConfig,
  jsThrottleMs = 100,
}: HorizontalBarChartProps): React.ReactElement => {
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

  const categoryLabels = React.useMemo(() => data.map((d) => d.x), [data]);
  const values = React.useMemo(() => data.map((d) => d.y), [data]);
  const LabelCount = data.length;

  const xAxisHeight = xLabelHeight * height; // numeric tick label strip at top
  const yAxisWidth = yLabelWidth * width; // category label strip on left
  const chartWidth = width - yAxisWidth; // horizontal drawing area (bars)
  const fixedChartHeight = height - xAxisHeight; // vertical drawing area (viewport)

  const LINE_HEIGHT = fontSize * 1.2;
  const textOffset = LINE_HEIGHT / 2;

  const maxValue = React.useMemo(() => max(values) || 1, [values]);

  // xScale: linear — maps 0→maxValue to 0→chartWidth (bars grow rightward)
  // memoize this so we don't need to rebuild it everytime component re-renders
  const xScale = React.useMemo(
    () => scaleLinear().domain([0, maxValue]).range([0, chartWidth]),
    [maxValue, chartWidth],
  );

  // Numeric tick marks along the top
  const xTicks: number[] = [];
  // render 0 at baseline first, rest of numbers later
  if (numXLabels !== 0) xTicks.push(0);
  for (let i = 1; i <= numXLabels; i++) {
    // round off the label numbers to nearest tens value
    // the following trick works as : if num=12 => math.round(12/10)*10 = 1*10 = 10
    let indexVal = i * (maxValue / numXLabels);
    xTicks[i] = Math.round(indexVal / 10) * 10;
  }

  // Logical full height of all bars stacked — only used to clamp scroll bounds.
  // Bandheight is the space(height) available to a bar (includes bar+padding space)
  // barGap is fraction of bandheight to be kept as padding space
  // so 1-brGap is fractional space left for one bar
  // total bandheight in the available drawable space is fixedChartHeight / LabelCount
  const naturalBandHeight = (fixedChartHeight / LabelCount) * (1 - barGap);
  const chartHeight: number = (() => {
    if (!scrollable) return fixedChartHeight;

    // if scrollable, however number of bars will fit within the fixedChartHeight itself, so actually no need to scroll
    if (naturalBandHeight >= minBarHeight) return fixedChartHeight;

    // if bars won't fit, calculate how many pixels would they actually fit in
    // bandheight_min * total number of bars (min bandheight = minBarHeight)
    return Math.ceil((minBarHeight * LabelCount) / (1 - barGap));
  })();

  // how many pixels will we need to scroll to reach last bar
  // if no scroll, we won't scroll and hence maxScroll = 0
  const maxScroll = Math.max(0, chartHeight - fixedChartHeight);

  // spread domain of labels to range from 0 to chartHeight (total pixels we need)
  // we will only show fixedChartHeight at a time, but we do need to tell scale the total px needed
  const yScale = React.useMemo(
    () =>
      scaleBand<string>()
        .domain(categoryLabels)
        .range([0, chartHeight])
        .paddingInner(barGap),
    [categoryLabels, chartHeight, barGap],
  );
  const barHeight = yScale.bandwidth();
  const eachBandHeight = chartHeight / LabelCount;

  // ── Scroll — a shared value, driven directly by Pan on the canvas. No ScrollView. ───────
  const scrollY = useSharedValue(0);
  // Mirrored into JS state ONLY for the slice math below (cheap, not
  // animation-driving) — updated via a throttled callback, not every frame.
  // WARNING : without throttle the JS fps would crash due to the sheer number of updates JS will have to do per second
  const [scrollOffset, setScrollOffset] = useState(0);
  const lastSyncTime = useSharedValue(0);
  const syncScrollToJS = (val: number) => setScrollOffset(val);

  // for selecting individual bars
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // shared value to animate the bars when clicked
  const skiaScaleX = useSharedValue<number>(1);
  const skiaTransform: DerivedValue<{ scaleX: number }[]> = useDerivedValue(
    () => [{ scaleX: skiaScaleX.value }],
  );

  // ---------------------------GESTURES-------------------------------------
  // Tap gesture handles tapping on skia generated bars
  // runs the animation and changes colour (animation only if it was not "none")
  const handleTap = (touchY: number, currentScroll: number) => {
    // absoulte touch = current pos. touched on screen + how many pixels have we scrolled
    const touchYAbs = touchY + currentScroll;
    const clickedIndex = Math.floor(touchYAbs / eachBandHeight);

    if (clickedIndex >= 0 && clickedIndex < LabelCount) {
      setActiveIndex((prev) => (prev === clickedIndex ? null : clickedIndex));
      if (animationType === "none") return;

      skiaScaleX.value = 0.85;
      if (animationType === "spring") {
        const cfg = {
          ...DEFAULT_SPRING_CONFIG,
          ...(animationConfig as SpringAnimationConfig),
        };
        skiaScaleX.value = withSpring(1, cfg);
      } else {
        const cfg = {
          ...DEFAULT_LINEAR_CONFIG,
          ...(animationConfig as LinearAnimationConfig),
        };
        skiaScaleX.value = withTiming(1, {
          duration: cfg.duration,
          // TODO : add easing config props so user can change this too just like spring
          easing: Easing.out(Easing.quad),
        });
      }
    }
  };

  // handle the tap on UI thread, but let JS handle the maths upon tap and animation part
  // this is because it involves react state changes too which can only be handled on JS thread
  const tapGesture = Gesture.Tap().onStart((g) => {
    "worklet";
    scheduleOnRN(handleTap, g.y, scrollY.value);
  });

  // Handle pan gesture for scroll
  // we throttle the "scrolling feel" which means it won't shoot off as soon as user moves their finger
  // we only make an update to scrolled value once in a 100ms (so at max 10 updates per second)
  // JS FPS performs worse at too much of a lower value
  useAnimatedReaction(
    () => scrollY.value,
    (current) => {
      const now = Date.now();
      if (now - lastSyncTime.value > jsThrottleMs) {
        lastSyncTime.value = now;
        // TODO : htnk why dont we handle this all on the ui thread itself?
        scheduleOnRN(syncScrollToJS, current);
      }
    },
  );
  const startScrollY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      "worklet";
      startScrollY.value = scrollY.value;
    })
    .onUpdate((e) => {
      "worklet";
      // going downwards is -ve value of traslationY, so as we go down, scrollY will increase
      // we clamp the scrollY to maxScroll value
      const next = startScrollY.value - e.translationY;
      scrollY.value = Math.max(0, Math.min(maxScroll, next));
    })
    .onEnd((e) => {
      // don't stop abruptly as user stops scrolling
      // rather give a slowing down swipe feel
      "worklet";
      scrollY.value = withDecay(
        {
          velocity: -e.velocityY, // same sign flip as translationY above
          clamp: [0, maxScroll],
        },
        () => {
          // decay settled — do one final JS sync so the rendered slice matches exactly
          scheduleOnRN(syncScrollToJS, scrollY.value);
        },
      );
    });

  // only one of pan or tap can work at a time
  // pan getsure has higher priority (written first in order)
  const composedGesture = Gesture.Exclusive(panGesture, tapGesture);

  const labelWidths = React.useMemo(
    // TODO : replace getTextWidth() deprecated now
    () => categoryLabels.map((label) => (font ? font.getTextWidth(label) : 0)),
    [categoryLabels, font],
  );

  const renderCanvas = (): React.ReactElement => {
    // Figure out which bars actually need to be drawn right now — only the
    // ones inside the visible scroll window, plus a small buffer (±2 bars
    // worth) so bars don't visibly pop in right at the screen edge when we scroll
    // firstVisibleIndex is the first bar of the current window (including a buffer of 2)
    const firstVisibleIndex = Math.max(
      0,
      Math.floor(scrollOffset / eachBandHeight) - 2,
    );
    // how many bars fit on screen, plus the same buffer on the far edge
    const visibleCount = Math.ceil(fixedChartHeight / eachBandHeight) + 4;
    // last bar of the cuurent window (including a buffer)
    const lastVisibleIndex = Math.min(
      LabelCount,
      firstVisibleIndex + visibleCount,
    );

    return (
      // single gesture system handles BOTH tap-to-select and drag-to-scroll —
      // Gesture.Exclusive ensures only one can be active per touch, so they
      // never fight over the same touch the way a separate ScrollView would
      <GestureDetector gesture={composedGesture}>
        <View style={{ width, height: fixedChartHeight, position: "relative" }}>
          {/* canvas is ALWAYS fixedChartHeight tall — never grows with data
            length. A canvas sized to fit ALL bars (chartHeight) can exceed
            the device's GPU surface size limit at large data counts and
            crash with no error — this is why we virtualise instead. */}
          <Canvas style={StyleSheet.absoluteFill}>
            {/* vertical grid lines at each numeric tick — fixed position,
              never scroll, drawn once per render regardless of scrollOffset */}
            {xTicks.map((tick, i) => {
              const x = xScale(tick);
              if (x === undefined) return null; // don't render bad data
              return (
                <Rect
                  key={`grid-${i}`}
                  x={x + yAxisWidth}
                  y={0}
                  width={1}
                  height={fixedChartHeight}
                  color="#666"
                  opacity={0.15}
                />
              );
            })}

            {/* only slice + map over the visible window, not the full dataset —
              this is the actual virtualisation: at 1000+ bars we still only
              ever create ~15-20 Skia nodes per render, not 1000 */}
            {categoryLabels
              .slice(firstVisibleIndex, lastVisibleIndex)
              .map((label, i) => {
                const index = firstVisibleIndex + i; // real index into full data
                const value = values[index] ?? 0;
                const fullBarWidth = xScale(value) ?? 0;

                // bar's true position in the FULL (unwindowed) data space,
                // then shift up by scrollOffset to land in the visible viewport
                const barTop = (yScale(label) ?? 0) - scrollOffset;
                const verticalOffset = (eachBandHeight - barHeight) / 2;
                const finalizedYPosition = barTop + verticalOffset;
                const isActive = activeIndex === index;

                const roundedBarGeometry = {
                  rect: {
                    x: yAxisWidth, // bars start right after the label column
                    y: finalizedYPosition,
                    width: fullBarWidth,
                    height: barHeight,
                  },
                  // right corners rounded, left corners flat so bars visually
                  // anchor flush against the y-axis line
                  topLeft: { x: 0, y: 0 },
                  bottomLeft: { x: 0, y: 0 },
                  topRight: { x: bend, y: bend },
                  bottomRight: { x: bend, y: bend },
                };

                return (
                  <Group key={`bar-${index}`}>
                    {/* inner Group exists ONLY so skiaTransform (the tap
                      "squish" animation) applies to the bar alone, not the
                      label text drawn alongside it */}
                    <Group
                      origin={{
                        x: yAxisWidth,
                        y: finalizedYPosition + barHeight / 2,
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
                        x={yAxisWidth - labelWidths[index] - 8} // right-align
                        y={finalizedYPosition + barHeight / 2 + fontSize / 3}
                        text={label}
                        font={font}
                        color={isActive ? labelActiveFontColor : labelFontColor}
                      />
                    )}

                    {/* value badge — only on the active/selected bar */}
                    {isActive &&
                      font &&
                      (() => {
                        const valueStr = value.toFixed(2);
                        const badgeTextWidth = font.getTextWidth(valueStr);
                        const badgePaddingX = 6;
                        const badgePaddingY = 3;
                        const badgeWidth = badgeTextWidth + badgePaddingX * 2;
                        const badgeHeight = fontSize + badgePaddingY * 2;

                        // 70% along the bar's width, so max-width bars don't clip the badge off-canvas
                        const badgeX = yAxisWidth + fullBarWidth * 0.7;
                        const badgeCenterY = finalizedYPosition + barHeight / 2;

                        return (
                          <Group key={`badge-${index}`}>
                            <RoundedRect
                              // ((x, y, width, height), rx, ry)
                              rect={rrect(
                                rect(
                                  badgeX - badgeWidth / 2,
                                  badgeCenterY - badgeHeight / 2,
                                  badgeWidth,
                                  badgeHeight,
                                ),
                                4,
                                4,
                              )}
                              color={badgeBackgroundColor}
                            />
                            <SkiaText
                              x={badgeX - badgeWidth / 2 + badgePaddingX}
                              y={badgeCenterY + fontSize / 3}
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

  return (
    <View style={{ width, height, marginTop: 50, marginLeft: 20 }}>
      <View
        style={{
          flexDirection: "row",
          height: xAxisHeight,
          marginLeft: yAxisWidth,
        }}
      >
        {xTicks.map((tick, i) => {
          const xScaleVal = xScale(tick);
          // no rendering text for bad data
          if (xScaleVal === undefined) return null;
          return (
            <Text
              key={i}
              style={[
                styles.xAxisText,
                {
                  position: "absolute",
                  left: xScaleVal - textOffset,
                  color: labelFontColor,
                },
              ]}
            >
              {tick}
            </Text>
          );
        })}
      </View>

      <View style={{ height: fixedChartHeight, overflow: "hidden" }}>
        {renderCanvas()}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  xAxisText: { fontSize: 12, fontWeight: "600" },
  yAxisText: { fontSize: 12, textAlign: "right" },
  activeYAxisText: { fontWeight: "bold" },
  valueBadge: {
    position: "absolute",
    backgroundColor: "#333",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    zIndex: 10,
    elevation: 3,
  },
  valueBadgeText: { color: "#fff", fontSize: 11, fontWeight: "bold" },
});

export default HorizontalBarChart;
