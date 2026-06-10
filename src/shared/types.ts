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
