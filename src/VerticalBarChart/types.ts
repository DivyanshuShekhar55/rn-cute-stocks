// Types 

import { AnimationConfig, AnimationType } from "../shared/types";

/* User data shall be of form :
[{x:label, y:num}], we extract x and y labels from it
*/
export interface BarDataItem {
  x: string;
  y: number;
}

export interface BarChartProps {
  width: number;
  height: number;
  data: BarDataItem[];
  color?: string;
  activeColor?: string;
  barGap?: number;
  bend?: number;
  numYLabels?: number;
  // if true, bars can scroll horizontally, y-axis stays sticky
  // by default is false
  scrollable?: boolean;
  // only used if scrollable=true, default is 25px
  // we try to adjust as many bars possible in the given width of screen
  // the bars of size are minBarWidth
  minBarWidth?: number;
  // default animation type is spring
  animationType?: AnimationType;
  /**
   * Config passed to the animation driver.
   * For "spring": { mass, damping, stiffness }
   * For "linear": { duration }
   * Ignored when animationType is "none".
   */
  animationConfig?: AnimationConfig;
}