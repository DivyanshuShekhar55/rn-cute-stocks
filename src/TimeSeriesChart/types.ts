import type { StyleProp, ViewStyle, TextStyle } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import type { TimeSeriesDataPoint, CurveType, SearchAlgorithm } from "../math";

// Types

export interface CursorProps {
  xPos: SharedValue<number>;
  yPos: SharedValue<number>;
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
