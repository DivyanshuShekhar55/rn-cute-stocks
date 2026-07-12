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

export interface LineTapInfo {
  tapX: number; // the actual/raw tap coordinate
  tapY: number;
  dataX: string;
  dataY: number;
  pointX: number; // snapped pixel x of nearest data point
  pointY: number; // snapped pixel y of nearest data point
  index: number;
}

export interface LineChartProps {
  width: number;
  height: number;
  chartData: LineDataPoint[];
  chartContainerStyles?: StyleProp<ViewStyle>;
  onTap: (info: LineTapInfo) => void;
  curveType?: CurveType;
  colors?: string[];
  cursorComponent?: (props: CursorProps) => React.ReactElement;
  curveStrokeWidth?: number;
  curveFill?: "stroke" | "fill";
  // valuePrefix e.g. "$", "€", "kg" — prepended to the displayed value
}
