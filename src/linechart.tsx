import { Text, View, StyleSheet } from "react-native";
import {
  Canvas,
  LinearGradient,
  Path,
  vec,
  Skia,
  Circle,
} from "@shopify/react-native-skia";
import { GenerateStringPath, GetYForX } from "./math";
import type { LineDataPoint, CurveType } from "./math";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useState } from "react";
import type { StyleProp, ViewStyle, TextStyle } from "react-native";
import type { SharedValue } from "react-native-reanimated";

// Types

interface CursorProps {
  xPos: SharedValue<number>;
  yPos: SharedValue<number>;
}

interface LineChartProps {
  width: number;
  height: number;
  chartData: LineDataPoint[];
  chartContainerStyles?: StyleProp<ViewStyle>;
  // label shown above chart — caller decides what to display (price, units, etc.)
  valueTextStyles?: StyleProp<TextStyle>;
  curveType?: CurveType;
  colors?: string[];
  cursorComponent?: (props: CursorProps) => React.ReactElement;
  curveStrokeWidth?: number;
  curveFill?: "stroke" | "fill";
  // valuePrefix e.g. "$", "€", "kg" — prepended to the displayed value
  valuePrefix?: string;
}

// Component

export const LineChart = ({
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

  const { strPath, xFunc, yFunc, data, xRangeMin, xRangeMax, step } =
    GenerateStringPath(curveType, chartData, width, height);

  const skPath = strPath ? Skia.Path.MakeFromSVGString(strPath) : null;

  // scalePoint returns number | undefined — the ?? 0 is a safety fallback
  // in practice the first label is always in domain so this won't be 0
  const initX = xFunc(data[0].x) ?? 0;
  const initY = yFunc(data[0].y);

  const xPos = useSharedValue<number>(initX);
  const yPos = useSharedValue<number>(initY);
  const valueAnimatedVal = useSharedValue<number>(data[0].y);

  const [valueText, setValueText] = useState<string>(data[0].y.toFixed(2));

  // valueAnimatedVal changes on UI thread — bridge to JS to update React state
  // toFixed() returns a string, required to avoid "all text must be in <Text>" error
  useDerivedValue(() => {
    const txt = valueAnimatedVal.value.toFixed(2);
    scheduleOnRN(setValueText, txt);
  }, [valueAnimatedVal]);

  const updateY = (clampedX: number): void => {
    // LineChart uses O(1) lookup (no search algorithm arg needed — scalePoint is evenly spaced)
    const result = GetYForX(clampedX, width, data, height);
    yPos.value = result.yCoord;
    valueAnimatedVal.value = withTiming(result.actualVal, { duration: 100 });
  };

  const pan = Gesture.Pan().onUpdate((evt) => {
    "worklet";
    const clamped = Math.max(xRangeMin, Math.min(xRangeMax, Number(evt.x)));
    xPos.value = clamped;
    scheduleOnRN(updateY, clamped);
  });

  return (
    <View style={[styles.container, chartContainerStyles]}>
      <Text style={[styles.valueText, valueTextStyles]}>
        {valuePrefix}{valueText}
      </Text>

      <GestureDetector gesture={pan}>
        <Canvas style={{ width, height }}>
          {cursorComponent
            ? cursorComponent({ xPos, yPos })
            : <Cursor xPos={xPos} yPos={yPos} />
          }

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
    <Circle style="fill"   color="#f69d69" cx={xPos} cy={yPos} r={5} />
    <Circle style="stroke" color="#f69d69" cx={xPos} cy={yPos} r={12} strokeWidth={2} opacity={0.65} />
    <Circle style="stroke" color="#f69d69" cx={xPos} cy={yPos} r={18} strokeWidth={2} opacity={0.65} />
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