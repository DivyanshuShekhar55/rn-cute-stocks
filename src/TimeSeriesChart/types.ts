import type { StyleProp, ViewStyle, TextStyle } from "react-native";
import { CursorProps, CurveType, SearchAlgorithm } from "../shared/types";
import { scaleLinear, scaleTime } from "d3-scale";

// Types

// types explicitly for the timeseries chart
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

/**
 * @param width width for the given chart in px
 * @param height height for the given chart (px)
 * @param chartData data for the chart
 * @param chartContainerStyles (optional) StyleSheet object for the chart container
 * @param priceTextStyles (optional) Stylesheet object for the chart heading text
 * @param curveType (optional) underlying curve mathematics (see `@type CurveType`)
 * @param colors (optional) an array of colours. If multiple colors provided, curve will have linear gradient of all these colors.
 * @param cursorComponent (optional) cursor for navigating the timeseries chart
 * @param curveStrokeWidth (optional) line width for the drawing the curve
 * @param curveFill (optional) "stroke" | "fill". `fill` will fill the area beneath the curve
 * @param ySearch (optional) strategy for searching the underlying datum when user drags their finger across the x-axis
 */
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
  valuePrefix?:string
}
