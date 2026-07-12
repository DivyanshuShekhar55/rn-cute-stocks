import type { StyleProp, ViewStyle } from "react-native";
import { CursorProps, CurveType } from "../shared/types";
import { scaleLinear, scaleTime } from "../math/scale/index";

// Types

// types explicitly for the timeseries chart
export interface TimeSeriesDataPoint {
  x: number; // unix ms
  y: number;
}

export interface TimeSeriesPathResult {
  strPath: string | null;
  xFunc: ReturnType<typeof scaleTime>;
  yFunc: ReturnType<typeof scaleLinear>;
  data: TimeSeriesDataPoint[];
  xRangeMin: number;
  xRangeMax: number;
}

export interface TimerSeriesPathConfig extends TimeSeriesPathResult {
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * @param tapX the raw x coordinate of the touch
 * @param tapY the raw y coordinate of the touch
 * @param dataX the x value of the data point that is tocuhed
 * @param dataY the y value of the data point that is tocuhed
 * @param pointX the x coordinate of the nearest point to touch coordinate
 * @param pointY the y coordinate of the nearest point to touch coordinate
 * @param index the index of the point in data array
 */
export interface TimeChartTapInfo {
  tapX: number; // the actual/raw tap coordinate
  tapY: number;
  dataX: number;
  dataY: number;
  pointX: number; // snapped pixel x of nearest data point
  pointY: number; // snapped pixel y of nearest data point
  index: number;
}

/**
 * @param width width for the given chart in px
 * @param height height for the given chart (px)
 * @param chartData data for the chart
 * @param onTap (optional) callback fn for the tap gesture
 * @param chartContainerStyles (optional) StyleSheet object for the chart container
 * @param curveType (optional) underlying curve mathematics (see `@type CurveType`)
 * @param colors (optional) an array of colours. If multiple colors provided, curve will have linear gradient of all these colors.
 * @param cursorComponent (optional) cursor for navigating the timeseries chart
 * @param curveStrokeWidth (optional) line width for the drawing the curve
 * @param curveFill (optional) "stroke" | "fill". `fill` will fill the area beneath the curve
 */
export interface TimeSeriesChartProps {
  width: number;
  height: number;
  chartData: TimeSeriesDataPoint[];
  onTap?: (info: TimeChartTapInfo) => void;
  chartContainerStyles?: StyleProp<ViewStyle>;
  curveType?: CurveType;
  colors?: string[];
  cursorComponent?: (props: CursorProps) => React.ReactElement;
  curveStrokeWidth?: number;
  curveFill?: "stroke" | "fill";
}
