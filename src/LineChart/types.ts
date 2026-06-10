import { SharedValue } from "react-native-reanimated";
import { CurveType, LineDataPoint } from "../math";
import { StyleProp, TextStyle, ViewStyle } from "react-native";

// Types

export interface CursorProps {
  xPos: SharedValue<number>;
  yPos: SharedValue<number>;
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
