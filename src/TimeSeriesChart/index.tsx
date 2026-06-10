import { Text, View, StyleSheet } from "react-native";
import {
  Canvas,
  LinearGradient,
  Path,
  vec,
  Skia,
  Circle,
} from "@shopify/react-native-skia";
import { GenerateStringPath_TimeSeries, GetYForX_TimeSeries } from "../math";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useState } from "react";
import { TimeSeriesChartProps } from "./types";
import { CursorProps } from "../shared/types";


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

  const { strPath, xFunc, yFunc, data, xRangeMin, xRangeMax } =
    GenerateStringPath_TimeSeries(curveType, chartData, width, height);

  const skPath = strPath ? Skia.Path.MakeFromSVGString(strPath) : null;

  const initX = xFunc(data[0].x) as number;
  const initY = yFunc(data[0].y);

  const xPos = useSharedValue<number>(initX);
  const yPos = useSharedValue<number>(initY);
  const priceAnimatedVal = useSharedValue<number>(data[0].y);

  const [priceText, setPriceText] = useState<string>(data[0].y.toFixed(2));

  // priceAnimatedVal changes on UI thread — bridge to JS to update React state
  // toFixed() returns a string, required to avoid "all text must be in <Text>" error
  // (a raw number passed to setText would be a number type, not a string)
  useDerivedValue(() => {
    const txt = priceAnimatedVal.value.toFixed(2);
    scheduleOnRN(setPriceText, txt);
  }, [priceAnimatedVal]);

  const updateY = (clampedX: number): void => {
    const result = GetYForX_TimeSeries(clampedX, width, data, height, ySearch);
    yPos.value = result.yCoord;
    priceAnimatedVal.value = withTiming(result.actualVal, { duration: 100 });
  };

  const pan = Gesture.Pan().onUpdate((evt) => {
    "worklet";
    const clamped = Math.max(xRangeMin, Math.min(xRangeMax, Number(evt.x)));
    xPos.value = clamped;
    scheduleOnRN(updateY, clamped);
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

export default TimeSeriesChart