import { Text, View, StyleSheet } from "react-native";
import {
  Canvas,
  LinearGradient,
  Path,
  vec,
  Skia,
  Circle,
} from "@shopify/react-native-skia";
import { GenerateStringPath, GetYForX } from "../math/pathGenerators";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useMemo, useRef, useState } from "react";
import { LineChartProps } from "./types";
import { CursorProps } from "../shared/types";

// Component
const LineChart = ({
  width,
  height,
  chartData,
  chartContainerStyles,
  valueTextStyles,
  curveType = "curveBasis",
  colors = ["#000"],
  cursorComponent,
  curveStrokeWidth = 2,
  curveFill = "stroke",
  valuePrefix = "",
}: LineChartProps): React.ReactElement | null => {
  if (!chartData || chartData.length === 0) return null;

  const { strPath, xFunc, yFunc, data, xRangeMin, xRangeMax, step } = useMemo(
    () => GenerateStringPath(curveType, chartData, width, height),
    [curveType, chartData, width, height],
  );

  const skPath = useMemo(
    () => (strPath ? Skia.Path.MakeFromSVGString(strPath) : null),
    [strPath],
  );

  // scalePoint returns number | undefined — the ?? 0 is a safety fallback
  // in practice the first label is always in domain so this won't be 0
  const initX = xFunc(data[0].x) ?? 0;
  const initY = yFunc(data[0].y) ?? 0;

  const xPos = useSharedValue<number>(initX);
  const yPos = useSharedValue<number>(initY);

  const [valueText, setValueText] = useState<string>(data[0].y.toFixed(2));

  const lastSetTime = useRef(0);

  const updateY = (clampedX: number): void => {
    const result = GetYForX(clampedX, width, data, height);

    // if returned position was undefined (due to bad data passed in) cursor won't update
    if (!result) return
    yPos.value = result.yCoord;

    const now = Date.now();
    if (now - lastSetTime.current > 100) {
      // ~10 updates/sec — plenty readable for a number
      lastSetTime.current = now;
      setValueText(result.actualVal.toFixed(2));
    }
  };

  const pan = Gesture.Pan().onUpdate((evt) => {
    const clamped = Math.max(xRangeMin, Math.min(xRangeMax, Number(evt.x)));
    xPos.value = clamped;

    scheduleOnRN(updateY, clamped);
  });

  return (
    <View style={[styles.container, chartContainerStyles]}>
      <Text style={[styles.valueText, valueTextStyles]}>
        {valuePrefix}
        {valueText}
      </Text>

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
              color="#fff"
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
  valueText: {
    color: "#000",
    fontSize: 52,
  },
});

export default LineChart;
