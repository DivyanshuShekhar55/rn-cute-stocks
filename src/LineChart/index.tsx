import { View, StyleSheet } from "react-native";
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
import { useMemo } from "react";
import { LineChartProps } from "./types";
import { CursorProps } from "../shared/types";

// Component
const LineChart = ({
  width,
  height,
  chartData,
  chartContainerStyles,
  onTap,
  curveType = "curveBasis",
  colors = ["#000"],
  cursorComponent,
  curveStrokeWidth = 2,
  curveFill = "stroke",
}: LineChartProps): React.ReactElement | null => {
  if (!chartData || chartData.length === 0) return null;

  const pathConfig = useMemo(
    () => GenerateStringPath(curveType, chartData, width, height),
    [curveType, chartData, width, height],
  );
  const { strPath, xFunc, yFunc, data, xRangeMin, xRangeMax } = pathConfig;

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

  // when curve is tapped, call the user's onTap callback
  const handleTap = (tapX: number, tapY: number): void => {
    const clampedX = Math.max(xRangeMin, Math.min(xRangeMax, tapX));
    const result = GetYForX(clampedX, pathConfig);
    if (!result) return;

    xPos.value = result.xCoord;
    yPos.value = result.yCoord;

    onTap?.({
      tapX,
      tapY,
      dataX: data[result.index].x,
      dataY: result.actualVal,
      pointX: result.xCoord,
      pointY: result.yCoord,
      index: result.index,
    });
  };

  const tap = Gesture.Tap().onEnd((evt) => {
    scheduleOnRN(handleTap, evt.x, evt.y);
  });

  return (
    <View style={[styles.container, chartContainerStyles]}>
      <GestureDetector gesture={tap}>
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
