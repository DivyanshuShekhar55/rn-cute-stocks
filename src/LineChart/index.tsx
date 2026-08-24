/*
  NOTE FOR CONTRIBUTORS:
  Please read the LineChart component before reading the TimeSeriesChart component.
  Both the files share same architecture and almost similar code.
  The LineChart component is more technically documented and explained.
 */

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
import { useEffect, useMemo } from "react";
import { LineChartProps } from "./types";
import { CursorProps } from "../shared/types";

// Component
const LineChart = ({
  width,
  height,
  chartData,
  chartContainerStyles,
  onTap,
  curveType = "curveLinear",
  colors = ["#000"],
  cursorComponent,
  curveStrokeWidth = 2,
  curveFill = "stroke",
}: LineChartProps): React.ReactElement | null => {
  // hooks must run unconditionally on every render (Rules of Hooks) —
  // moved the empty-data early return to after all hooks instead of before them
  const hasData = !!chartData && chartData.length > 0;

  const pathConfig = useMemo(
    () =>
      hasData
        ? GenerateStringPath(curveType, chartData, width, height)
        : null,
    [curveType, chartData, width, height, hasData],
  );

  const skPath = useMemo(
    () =>
      pathConfig?.strPath
        ? Skia.Path.MakeFromSVGString(pathConfig.strPath)
        : null,
    [pathConfig],
  );

  // scalePoint returns number | undefined — the ?? 0 is a safety fallback
  // in practice the first label is always in domain so this won't be 0
  const initX = hasData
    ? (pathConfig!.xFunc(pathConfig!.data[0].x) ?? 0)
    : 0;
  const initY = hasData
    ? (pathConfig!.yFunc(pathConfig!.data[0].y) ?? 0)
    : 0;

  const xPos = useSharedValue<number>(initX);
  const yPos = useSharedValue<number>(initY);

  // if data is initially empty -> data comes, say an axios/sqlite fetch in an app
  //  the cursor would stay fixed at (0, 0) [the default when hasData = false]
  // so to track it we use this useEffect
  // re-runs whenever data transition happens as we talked above
  // also when data changes, because that will ultimately change initX and initY
  // so if we ever add polling/live data or anything that changes data,
  // stop these re-renders with a ref maybe
  useEffect(() => {
    if (hasData) {
      xPos.value = initX;
      yPos.value = initY;
    }
  }, [hasData, initX, initY]);

  // when curve is tapped, call the user's onTap callback
  const handleTap = (tapX: number, tapY: number): void => {
    if (!pathConfig) return;
    const clampedX = Math.max(
      pathConfig.xRangeMin,
      Math.min(pathConfig.xRangeMax, tapX),
    );
    const result = GetYForX(clampedX, pathConfig);
    if (!result) return;

    xPos.value = result.xCoord;
    yPos.value = result.yCoord;

    onTap?.({
      tapX,
      tapY,
      dataX: pathConfig.data[result.index].x,
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

          {hasData && skPath && (
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