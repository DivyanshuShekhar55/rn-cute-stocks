/**
 * these are types shared by one or more charts
 **/

import { SharedValue } from "react-native-reanimated";

export type AnimationType = "spring" | "linear" | "none";

export interface SpringAnimationConfig {
  mass?: number;
  damping?: number;
  stiffness?: number;
}

export interface LinearAnimationConfig {
  duration?: number;
}

export type AnimationConfig = SpringAnimationConfig | LinearAnimationConfig;

export interface BarDataItem {
  x: string; // category label — rendered on the left (y-axis side)
  y: number; // numeric value  — bars grow rightward
}

export interface CursorProps {
  xPos: SharedValue<number>;
  yPos: SharedValue<number>;
}

export type CurveType =
  | "curveBasis"
  | "curveBumpX"
  | "curveLinear"
  | "curveMonotoneX"
  | "natural";

export type SearchAlgorithm = "binarySearchWithInterpolation";

// whenever user touches on chart we must calculate the x, y of touch and the (nearest) data point 
// actualVal is just the value of 'y' from the clicked data point
// index is the index of data point in the data array
export interface YForXResult {
  yCoord: number;
  actualVal: number;
  index: number;
  xCoord: number;
}
