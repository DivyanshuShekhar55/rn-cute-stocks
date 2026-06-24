/**
 * NOTE FOR CONTRIBUTORS:
 * Please read the LineChart component before reading this code.
 * Both the files share same architecture and almost similar code.
 * The LineChart component is more technically documented and explained.
 */

import { Text, View, StyleSheet } from "react-native";
import {
  Canvas,
  LinearGradient,
  Path,
  vec,
  Skia,
  Circle,
} from "@shopify/react-native-skia";
import {
  GenerateStringPath_TimeSeries,
  GetYForX_TimeSeries,
} from "../math/index";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";
import { useMemo, useRef, useState } from "react";
import { TimeSeriesChartProps } from "./types";
import { CursorProps } from "../shared/types";
import { scheduleOnRN } from "react-native-worklets";

// Component

const TimeSeriesChart = ({
  width,
  height,
  chartData,
  chartContainerStyles,
  priceTextStyles,
  curveType = "curveBasis",
  colors = ["#000"],
  cursorComponent,
  curveStrokeWidth = 2,
  curveFill = "stroke",
  ySearch = "binarySearchWithInterpolation",
}: TimeSeriesChartProps): React.ReactElement | null => {
  if (!chartData || chartData.length === 0) return null;

  // cache the scales, min, miax, string-path
  const { strPath, xFunc, yFunc, data, xRangeMin, xRangeMax } = useMemo(
    () => GenerateStringPath_TimeSeries(curveType, chartData, width, height),
    [curveType, chartData, width, height],
  );

  const skPath = useMemo(
    () => (strPath ? Skia.Path.MakeFromSVGString(strPath) : null),
    [strPath],
  );

  const initX = xFunc(data[0].x) as number;
  const initY = yFunc(data[0].y);

  // x and y position for cursor
  const xPos = useSharedValue<number>(initX);
  const yPos = useSharedValue<number>(initY);

  const [priceText, setPriceText] = useState<string>(data[0].y.toFixed(2));

  // we no longer need a shared value + useDerivedValue bridge here.
  // updateY already runs on the JS thread (it's invoked via scheduleOnRN
  // from the pan handler below), so setPriceText can just be called
  // directly — there's no UI-thread value to bridge across anymore.
  // we still throttle it though: onUpdate can fire many times per second
  // during a real drag, and calling setPriceText that often re-renders the
  // whole component that often, which is enough on its own to tank JS FPS.
  const lastSetTime = useRef(0);

  const updateY = (clampedX: number): void => {
    const result = GetYForX_TimeSeries(clampedX, width, data, height, ySearch);
    yPos.value = result.yCoord;

    // TODO :
    // let the user choose the throttling
    // lower throttle and more points have an adverse effect on performance
    const now = Date.now();
    if (now - lastSetTime.current > 100) {
      lastSetTime.current = now;
      setPriceText(result.actualVal.toFixed(2));
    }
  };

  const pan = Gesture.Pan().onUpdate((evt) => {
    "worklet";
    const clamped = Math.max(xRangeMin, Math.min(xRangeMax, Number(evt.x)));
    xPos.value = clamped; // UI thread — instant cursor feedback
    scheduleOnRN(updateY, clamped); // JS thread — data lookup + throttled state update
  });

  return (
    <View style={[styles.container, chartContainerStyles]}>
      <Text style={[styles.priceText, priceTextStyles]}>${priceText}</Text>

      <GestureDetector gesture={pan}>
        <Canvas style={{ width, height }}>
          {cursorComponent ? (
            cursorComponent({ xPos, yPos })
          ) : (
            <Cursor xPos={xPos} yPos={yPos} />
          )}

          {skPath && (
            <Path
              path={skPath}
              style={curveFill}
              strokeWidth={curveStrokeWidth}
              // color is required by Skia's Path even when using LinearGradient child
              // the gradient overrides the actual fill/stroke color at render time
              color="transparent"
            >
              <LinearGradient
                start={vec(0, 0)}
                end={vec(width, height)}
                colors={colors}
              />
            </Path>
          )}
        </Canvas>
      </GestureDetector>
    </View>
  );
};

// Cursor

const Cursor = ({ xPos, yPos }: CursorProps): React.ReactElement => (
  <>
    <Circle style="fill" color="#f69d69" cx={xPos} cy={yPos} r={5} />
    <Circle
      style="stroke"
      color="#f69d69"
      cx={xPos}
      cy={yPos}
      r={12}
      strokeWidth={2}
      opacity={0.65}
    />
    <Circle
      style="stroke"
      color="#f69d69"
      cx={xPos}
      cy={yPos}
      r={18}
      strokeWidth={2}
      opacity={0.65}
    />
  </>
);

// Styles

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: "transparent",
  },
  priceText: {
    color: "#000",
    fontSize: 52,
  },
});

export default TimeSeriesChart;
