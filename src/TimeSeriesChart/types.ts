import type { StyleProp, ViewStyle, TextStyle } from "react-native";
import { CursorProps, CurveType, SearchAlgorithm } from "../shared/types";
import { scaleLinear, scaleTime } from "d3-scale";

// Types

// types explicitly fot the timeseries chart
export interface TimeSeriesDataPoint {
  x: number; // unix ms
  y: number;
}

export interface TimeSeriesPathResult {
  strPath: string | null;
  xFunc: ReturnType<typeof scaleTime>;
  yFunc: ReturnType<typeof scaleLinear<number, number>>;
  data: TimeSeriesDataPoint[];
  xRangeMin: number;
  xRangeMax: number;
}

export interface TimerSeriesPathConfig extends TimeSeriesPathResult {
  canvasWidth: number;
  canvasHeight: number;
}

export interface TimeSeriesChartProps {
  width: number;
  height: number;
  chartData: TimeSeriesDataPoint[];
  chartContainerStyles?: StyleProp<ViewStyle>;
  priceTextStyles?: StyleProp<TextStyle>;
  curveType?: CurveType;
  colors?: string[];
  cursorComponent?: (props: CursorProps) => React.ReactElement;
  curveStrokeWidth?: number;
  curveFill?: "stroke" | "fill";
  ySearch?: SearchAlgorithm;
}
