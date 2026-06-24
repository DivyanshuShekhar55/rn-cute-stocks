// Types

import { AnimationConfig, AnimationType, BarDataItem } from "../shared/types";

/* User data shall be of form :
[{x:label, y:num}], we extract x and y labels from it
*/
/**
 * @param width width for the given chart in px
 * @param height height for the given chart (px)
 * @param data data for the bar chart
 * @param color colour for the bars
 * @param activeColor bar colour when active/selected
 * @param barGap a fraction of bar bandwidth to use as padding between bars (0<= barGap <= 1)
 * @param bend corner radius for bars
 * @param numYLabels numbers of labels to render for the given chart
 * @param labelFontColor font colour for the axis labels
 * @param labelActiveFontColor font colour for the axis labels when selected
 * @param scrollable whether chart canvas should scroll or fit all bars into given dimension
 * @param minBarWidth minimum bar size when `scrollable` is true
 * @param animationType "spring" | "linear" | "none"
 * @param animationConfig custom config for motion when animation is applied
 * @returns VerticalBarChart component
 */
export interface BarChartProps {
  width: number;
  height: number;
  data: BarDataItem[];
  color?: string;
  activeColor?: string;
  barGap?: number;
  bend?: number;
  numYLabels?: number;

  labelFontColor?: string;
  labelActiveFontColor?: string;

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
