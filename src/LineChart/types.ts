import { StyleProp, TextStyle, ViewStyle } from "react-native";
import { CursorProps, CurveType } from "../shared/types";
import { scaleLinear, scalePoint } from "../math/scale";

// Types

// types for the linear chart (normal one)
// can have x label of any type user passes in, not strictly timestamp
export interface LineDataPoint {
  x: string;
  y: number;
}

export interface LineChartPathResult {
  strPath: string | null;
  xFunc: ReturnType<typeof scalePoint<string>>;
  yFunc: ReturnType<typeof scaleLinear>;
  data: LineDataPoint[];
  xRangeMin: number;
  xRangeMax: number;
  step: number;
}

export interface LineChartPathConfig extends LineChartPathResult {
  canvasWidth: number;
  canvasHeight: number;
}

export interface LineChartProps {
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
