// Types

import { AnimationConfig, AnimationType } from "../shared/types";

export interface BarDataItem {
  x: string; // category label — rendered on the left (y-axis side)
  y: number; // numeric value  — bars grow rightward
}

export interface HorizontalBarChartProps {
  width: number;
  height: number;
  data: BarDataItem[];
  color?: string;
  activeColor?: string;
  barGap?: number;
  bend?: number;
  numXLabels?: number;
  /** If true, bars scroll vertically; category labels stay sticky on left. Default: false */
  scrollable?: boolean;
  /** Minimum bar height in px when scrollable. Default: 25 */
  minBarHeight?: number;
  /** Tap animation type. Default: "spring" */
  animationType?: AnimationType;
  /**
   * Config passed to the animation driver.
   * For "spring": { mass, damping, stiffness }
   * For "linear": { duration }
   * Ignored when animationType is "none".
   */
  animationConfig?: AnimationConfig;
}
