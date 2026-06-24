import {
  Canvas,
  DashPathEffect,
  Line,
  matchFont,
  Rect,
  Text,
  vec,
} from "@shopify/react-native-skia";
import { scaleLinear } from "d3-scale";
import React, { useState, useMemo } from "react";
import { Platform, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useDerivedValue, useSharedValue } from "react-native-reanimated";
import { FindDomain } from "../math/pathGenerators";
import { scheduleOnRN } from "react-native-worklets";
import {
  AxisLinePathEffect,
  Candle,
  CandleChartProps,
  CandleStickChartProps,
  CandleStickProps,
  Domain,
} from "./types";

const CandleChart = ({
  width,
  height,
  data,
  fill,
  wickColor,
  domain,
}: CandleChartProps) => {
  let candleWidth = width / data.length;
  // scaleY maps price values to pixel Y positions (inverted: high price = low Y)
  const scaleY = scaleLinear().domain(domain).range([height, 0]);
  // scaleBody maps a price delta to a pixel height for the candle body
  const scaleBody = scaleLinear()
    .domain([0, Math.max(...domain) - Math.min(...domain)])
    .range([0, height]);

  return (
    <>
      {data.map((candle, idx) => (
        <CandleStick
          key={idx}
          scaleY={scaleY}
          scaleBody={scaleBody}
          index={idx}
          candleWidth={candleWidth}
          fill={fill}
          candle={candle}
          wickColor={wickColor}
        />
      ))}
    </>
  );
};

// CandleStick

// Horizontal padding on each side of the candle body (keeps bodies from touching)
const MARGIN = 4;

const CandleStick = ({
  scaleY,
  scaleBody,
  index,
  candleWidth,
  fill,
  candle,
  wickColor,
}: CandleStickProps) => {
  const { high, low, open, close } = candle;
  // green if bullish (close > open), red if bearish
  const col = close > open ? fill[0] : fill[1];
  const x = index * candleWidth;
  // yHigh is the top of the candle body (higher price = lower Y in canvas coords)
  const yHigh = scaleY(Math.max(open, close));
  const candleHeight = scaleBody(Math.abs(open - close));
  return (
    <>
      {/* Wick: thin vertical line from high to low */}
      <Line
        p1={vec(x + candleWidth / 2, scaleY(high))}
        p2={vec(x + candleWidth / 2, scaleY(low))}
        strokeWidth={1}
        color={wickColor}
      />
      {/* Body: filled rectangle between open and close */}
      <Rect
        x={x + MARGIN}
        y={yHigh}
        width={candleWidth - 2 * MARGIN}
        height={candleHeight}
        color={col}
      />
    </>
  );
};

// CandleStickChart

const CandleStickChart = ({
  width,
  height,
  data,
  bgCol = "white",
  fill = ["green", "red"],
  currency = "$",
  labelFontSize = 18,
  labelRightOffset = 96,
  labelFontCol = "black",
  numLabels = 5,
  axisFontColor = "black",
  axisFontSize = 14,
  axisLabelRightOffset = 54,
  axisLabelBottomOffset = 20,
  axisLinePathEffect = "dashed",
  axisLineColor = "gray",
  wickColor = "rgba(255, 255, 255, 0.6)",
  crossHairColor = "rgba(255,255,255,0.6)",
  maxVisibleCandles = 50,
  minVisibleCandles = 10,
}: CandleStickChartProps) => {
  // chartRegion is the drawable area minus the axis label margins
  const chartRegionWidth = width - axisLabelRightOffset;
  const chartRegionHeight = height - axisLabelBottomOffset;

  // state for visible range (updates axes on gesture end)
  // visibleStart for example is min price for the candles currently on screen
  const [visibleStart, setVisibleStart] = useState<number>(
    Math.max(0, data.length - Math.min(maxVisibleCandles, data.length)),
  );
  const [visibleEnd, setVisibleEnd] = useState<number>(data.length);

  // Shared values for gestures
  const scale = useSharedValue<number>(1);
  const savedScale = useSharedValue<number>(1);
  const panOffset = useSharedValue<number>(0);
  const savedPanOffset = useSharedValue<number>(0);

  // focalX will be used for focusing around a candle when user zooms around it
  const focalX = useSharedValue<number>(0);

  // snapshot of visible range at the start of each gesture, so onUpdate can
  // compute deltas relative to where the gesture began
  const savedVisibleStart = useSharedValue<number>(visibleStart);
  const savedVisibleEnd = useSharedValue<number>(visibleEnd);

  // Crosshair state
  const x = useSharedValue<number>(0);
  const y = useSharedValue<number>(0);
  const isActive = useSharedValue<boolean>(false);

  // Calculate visible data and domain
  // *** TODO :  in future check if calculating slice everytime is really performant
  // can we use smthing like a sliding window?
  const visibleData = useMemo<Candle[]>(() => {
    return data.slice(visibleStart, visibleEnd);
  }, [data, visibleStart, visibleEnd]);

  const domain = useMemo<Domain>(() => {
    return FindDomain(visibleData);
  }, [visibleData]);

  // pixel width of a single candle slot in the current visible window
  const caliber = chartRegionWidth / visibleData.length;

  // Snap X (user's touch and crosshair X) to nearest candle's center
  const snappedX = useDerivedValue(() => {
    // following line finds nearest candle's start value
    const slot = Math.floor(x.value / caliber);
    const clamped = Math.max(0, Math.min(slot, visibleData.length - 1));
    // this line snaps first to start of candle, then +candleWidth/2 to get to center
    return clamped * caliber + caliber / 2;
  });

  const clampedY = useDerivedValue(() => {
    return Math.min(chartRegionHeight, Math.max(y.value, 0));
  });

  // had to create the derived values as any skia prop that depends on a shared value ...
  // must itself be a derived value, otherwise it won't update on the skia side
  const verticalP1 = useDerivedValue(() => vec(snappedX.value, 0));
  const verticalP2 = useDerivedValue(() =>
    vec(snappedX.value, chartRegionHeight),
  );
  const horizontalP1 = useDerivedValue(() => vec(0, clampedY.value));
  const horizontalP2 = useDerivedValue(() =>
    vec(chartRegionWidth, clampedY.value),
  );

  // crosshair is only visible while user is actively touching (isActive = true)
  const crosshairOpacity = useDerivedValue(() => {
    return isActive.value ? 1 : 0;
  });

  // Pinch gesture for zoom
  // live zoom updates
  // note for devs - to save some work on RN thread move onUpdate's current logic to onEnd and just do live updates on onUpdate without calculating visible range, then calculate visible range on onEnd based on the final scale value. This way we can avoid doing all the visible range calculations on the RN thread during pinch and only do it once at the end of pinch when user lifts fingers up. For now I kept it in onUpdate to keep the zoom feeling more responsive with live updates, but if you notice any performance issues during pinch, this is something to try.
  // 2 finger gesture
  const pinch = Gesture.Pinch()
    .onStart((evt) => {
      savedScale.value = scale.value;
      focalX.value = evt.focalX; // capture focal point at gesture start
      // Save the initial visible range when pinch starts
      savedVisibleStart.value = visibleStart;
      savedVisibleEnd.value = visibleEnd;
    })
    .onUpdate((evt) => {
      scale.value = savedScale.value * evt.scale;

      // Live zoom updates during pinch
      const initialCount = savedVisibleEnd.value - savedVisibleStart.value;
      const newCount = Math.round(initialCount / scale.value);
      const clampedCount = Math.max(
        minVisibleCandles,
        Math.min(maxVisibleCandles, Math.min(newCount, data.length)),
      );

      // Find which candle index the focal point is sitting on
      const focalRatio = focalX.value / chartRegionWidth;
      const focalCandleIndex = Math.round(
        savedVisibleStart.value + focalRatio * initialCount,
      );

      // Keep the focal candle at the same ratio position in the new window
      const newStart = Math.round(focalCandleIndex - focalRatio * clampedCount);
      const newEnd = newStart + clampedCount;

      // Clamp both ends to data bounds
      const clampedStart = Math.max(0, newStart);
      const clampedEnd = Math.min(data.length, newEnd);

      // Live update the visible range
      scheduleOnRN(setVisibleStart, clampedStart);
      scheduleOnRN(setVisibleEnd, clampedEnd);
    })
    .onEnd(() => {
      // Reset scale for next gesture
      scale.value = 1;
      savedScale.value = 1;
    });

  // Crosshair - one finger only
  const crosshair = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .onStart((evt) => {
      isActive.value = true;
      x.value = evt.x;
      y.value = evt.y;
    })
    .onUpdate((evt) => {
      x.value = evt.x;
      y.value = evt.y;
      isActive.value = true;
    })
    .onEnd(() => {
      isActive.value = false;
    })
    .onFinalize(() => {
      // onFinalize covers cancelled gestures (e.g. interrupted by a phone call)
      isActive.value = false;
    });

  // Horizontal scroll - three fingers with live UI updates
  const panScroll = Gesture.Pan()
    .minPointers(3)
    .maxPointers(3)
    .onStart(() => {
      isActive.value = false;
      savedPanOffset.value = panOffset.value;
      // Save the initial visible range when gesture starts
      savedVisibleStart.value = visibleStart;
      savedVisibleEnd.value = visibleEnd;
    })
    .onUpdate((evt) => {
      panOffset.value = savedPanOffset.value + evt.translationX;

      // Live update during gesture
      const candlesToShift = Math.round(-panOffset.value / caliber);
      const currentCount = savedVisibleEnd.value - savedVisibleStart.value;

      const newEnd = Math.min(
        data.length,
        Math.max(currentCount, savedVisibleEnd.value + candlesToShift),
      );
      const newStart = Math.max(0, newEnd - currentCount);

      // Apply live updates
      scheduleOnRN(setVisibleStart, newStart);
      scheduleOnRN(setVisibleEnd, newEnd);
    })
    .onEnd(() => {
      // Reset pan offset for next gesture
      panOffset.value = 0;
      savedPanOffset.value = 0;
    });

  // Compose: crosshair OR (pinch + pan together)
  // Race means whichever gesture activates first wins and cancels the others
  const composed = Gesture.Race(crosshair, pinch, panScroll);

  return (
    <View>
      {/* separated the axes from main canvas as don't want to re-render axes everytime user moves a finger */}
      <Axis
        data={visibleData}
        width={width} // give exact dimensions passed by user, so axes remain in margin area
        height={height}
        bgCol={bgCol}
        domain={domain}
        numLabels={numLabels}
        axisFontSize={axisFontSize}
        axisFontColor={axisFontColor}
        axisLineColor={axisLineColor}
        axisLinePathEffect={axisLinePathEffect}
        axisLabelRightOffset={axisLabelRightOffset}
        axisLabelBottomOffset={axisLabelBottomOffset}
      />

      <GestureDetector gesture={composed}>
        {/* zIndex 1 so this sits on top of the Axis canvas and receives touches */}
        <Canvas
          style={{
            width: chartRegionWidth,
            height: chartRegionHeight,
            backgroundColor: "transparent",
            position: "absolute",
            top: 0,
            left: 0,
            zIndex: 1,
          }}
        >
          <CandleChart
            width={chartRegionWidth}
            height={chartRegionHeight}
            fill={fill}
            data={visibleData}
            wickColor={wickColor}
            domain={domain}
          />

          {/* Horizontal crosshair line */}
          <Line
            p1={horizontalP1}
            p2={horizontalP2}
            strokeWidth={1}
            color={crossHairColor}
            opacity={crosshairOpacity}
          />

          {/* Vertical crosshair line, snapped to nearest candle center */}
          <Line
            p1={verticalP1}
            p2={verticalP2}
            strokeWidth={1}
            color={crossHairColor}
            opacity={crosshairOpacity}
          />

          <Label
            y={clampedY}
            domain={domain}
            currency={currency}
            isActive={isActive}
            fontColor={labelFontCol}
            fontSize={labelFontSize}
            width={chartRegionWidth}
            height={chartRegionHeight}
            labelRightOffset={labelRightOffset}
          />
        </Canvas>
      </GestureDetector>
    </View>
  );
};

// Label

interface LabelProps {
  // clampedY derived value — the current Y position of the crosshair
  y: ReturnType<typeof useDerivedValue<number>>;
  width: number;
  height: number;
  domain: Domain;
  isActive: ReturnType<typeof useSharedValue<boolean>>;
  currency: string;
  fontSize: number;
  fontColor: string;
  labelRightOffset: number;
}

const Label = ({
  y,
  width,
  height,
  domain,
  isActive,
  currency,
  fontSize,
  fontColor,
  labelRightOffset,
}: LabelProps) => {
  // Derives the price string from Y position — runs on the UI thread as a worklet
  const formattedPrice = useDerivedValue(() => {
    "worklet";
    let min = domain[0];
    let max = domain[1];
    const price = max - (y.value / height) * (max - min);
    return `${currency}${price.toFixed(2)}`;
  });

  const opacity = useDerivedValue(() => {
    return isActive.value ? 1 : 0;
  });

  const textY = useDerivedValue(() => {
    // Adjust Y position so text doesn't go off screen
    return Math.max(fontSize, Math.min(y.value + fontSize, height));
  });

  // go with default system fonts for now
  // TODO : might add customised fonts here
  const fontFamily = Platform.select({ default: "sans-serif" });
  const fontStyle = {
    fontFamily,
    fontSize: fontSize,
    // "as const" needed so TS infers the literal type, not string
    fontWeight: "500" as const,
  };
  const font = matchFont(fontStyle);

  return (
    <Text
      x={width - labelRightOffset}
      y={textY}
      text={formattedPrice}
      opacity={opacity}
      font={font}
      color={fontColor}
    />
  );
};

// Axis

interface AxisProps {
  data: Candle[];
  width: number;
  height: number;
  bgCol: string;
  domain: Domain;
  numLabels: number;
  axisFontSize: number;
  axisFontColor: string;
  axisLineColor: string;
  axisLinePathEffect: AxisLinePathEffect;
  axisLabelRightOffset: number;
  axisLabelBottomOffset: number;
}

const Axis = ({
  data,
  width,
  height,
  bgCol,
  domain,
  numLabels,
  axisFontSize,
  axisFontColor,
  axisLineColor,
  axisLinePathEffect,
  axisLabelRightOffset,
  axisLabelBottomOffset,
}: AxisProps) => {
  return (
    // pointerEvents="none" so touches pass through to the chart canvas above
    <Canvas
      style={{
        width: width,
        height: height,
        zIndex: 0,
        backgroundColor: bgCol,
      }}
      pointerEvents="none"
    >
      <YAxis
        height={height - axisLabelBottomOffset}
        width={width}
        domain={domain}
        numLabels={numLabels}
        axisFontColor={axisFontColor}
        axisFontSize={axisFontSize}
        axisLabelRightOffset={axisLabelRightOffset}
        axisLineColor={axisLineColor}
        axisLinePathEffect={axisLinePathEffect}
      />
      <XAxis
        height={height}
        width={width - axisLabelRightOffset}
        data={data}
        numLabels={numLabels}
        axisFontColor={axisFontColor}
        axisFontSize={axisFontSize}
        axisLabelBottomOffset={axisLabelBottomOffset}
        axisLineColor={axisLineColor}
        axisLinePathEffect={axisLinePathEffect}
      />
    </Canvas>
  );
};

// YAxis

interface YAxisProps {
  width: number;
  height: number;
  domain: Domain;
  numLabels: number;
  axisFontSize: number;
  axisFontColor: string;
  axisLineColor: string;
  axisLinePathEffect: AxisLinePathEffect;
  axisLabelRightOffset: number;
}

const YAxis = ({
  width,
  height,
  domain,
  numLabels,
  axisFontSize,
  axisFontColor,
  axisLineColor,
  axisLinePathEffect,
  axisLabelRightOffset,
}: YAxisProps) => {
  const fontFamily = Platform.select({ default: "sans-serif" });
  const fontStyle = {
    fontFamily,
    fontSize: axisFontSize,
    fontWeight: "500" as const,
  };
  const font = matchFont(fontStyle);

  const [min, max] = domain;
  const priceStep = (max - min) / (numLabels - 1);

  // verticalPadding keeps the top and bottom labels from being clipped
  const verticalPadding = axisFontSize / 2;

  return (
    <>
      {Array.from({ length: numLabels }).map((_, idx) => {
        const price = max - idx * priceStep;
        // evenly distribute label positions within the padded height
        const yPos =
          verticalPadding +
          (idx / (numLabels - 1)) * (height - 2 * verticalPadding);

        return (
          <React.Fragment key={idx}>
            <Text
              x={width - axisLabelRightOffset}
              y={yPos + axisFontSize / 2}
              text={`$${price.toFixed(2)}`}
              color={axisFontColor}
              font={font}
            />

            <AxisLine
              axisLinePathEffect={axisLinePathEffect}
              axisLineColor={axisLineColor}
              x1={width}
              y1={yPos}
              x2={0}
              y2={yPos}
            />
          </React.Fragment>
        );
      })}
    </>
  );
};

// XAxis

interface XAxisProps {
  data: Candle[];
  width: number;
  height: number;
  numLabels: number;
  axisFontSize: number;
  axisFontColor: string;
  axisLineColor: string;
  axisLinePathEffect: AxisLinePathEffect;
  axisLabelBottomOffset: number;
}

const XAxis = ({
  data,
  width,
  height,
  numLabels,
  axisFontSize,
  axisFontColor,
  axisLineColor,
  axisLinePathEffect,
}: XAxisProps) => {
  const fontFamily = Platform.select({ default: "sans-serif" });
  const fontStyle = {
    fontFamily,
    fontSize: axisFontSize,
    fontWeight: "500" as const,
  };
  const font = matchFont(fontStyle);

  const step = Math.floor(data.length / (numLabels - 1));
  const dataLen = data.length;

  // we do following reduction to width
  //  so that the last label doesn't overlap with first label of y-axis
  width -= axisFontSize;

  return (
    <>
      {Array.from({ length: numLabels }).map((_, idx) => {
        const dataIdx = Math.min(idx * step, data.length - 1);
        const candle = data[dataIdx];
        const xPos = (dataIdx / dataLen) * width;
        const date = new Date(candle.timestamp * 1000).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false, // change to true for 12hr format like "12:05 PM"
        });

        return (
          <React.Fragment key={idx}>
            <Text
              x={xPos}
              y={height}
              text={date}
              color={axisFontColor}
              font={font}
            />
            <AxisLine
              axisLinePathEffect={axisLinePathEffect}
              axisLineColor={axisLineColor}
              x1={xPos}
              y1={0}
              x2={xPos}
              y2={height}
            />
          </React.Fragment>
        );
      })}
    </>
  );
};

// AxisLine
// axisLinePathEffect is either "dashed", "line" or "none"
// none removes the axis lines

interface AxisLineProps {
  axisLinePathEffect: AxisLinePathEffect;
  axisLineColor: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const AxisLine = ({
  axisLinePathEffect,
  axisLineColor,
  x1,
  y1,
  x2,
  y2,
}: AxisLineProps) => {
  // add line stroke style option
  if (axisLinePathEffect === "none") {
    return null;
  }
  return (
    <Line
      p1={vec(x1, y1)}
      p2={vec(x2, y2)}
      color={axisLineColor}
      strokeWidth={0}
    >
      {axisLinePathEffect === "dashed" && <DashPathEffect intervals={[4, 4]} />}
    </Line>
  );
};

export default CandleStickChart;
