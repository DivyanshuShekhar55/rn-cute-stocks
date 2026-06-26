// Types

import { AnimationConfig, AnimationType, BarDataItem } from "../shared/types";
/**
 * @param width width for the given chart in px
 * @param height height for the given chart (px)
 * @param data data for the bar chart
 * @param color colour for the bars
 * @param activeColor bar colour when active/selected
 * @param barGap a fraction of bar bandwidth to use as padding between bars (0<= barGap <= 1)
 * @param bend corner radius for bars
 * @param numXLabels numbers of labels to render for the given chart
 * @param fontSize font size for labels and badge text
 * @param labelFontColor font colour for the axis labels
 * @param labelActiveFontColor font colour for the axis labels when selected
 * @param badgeBackgroundColor bg color for the active bar's value badge
 * @param badgeFontColor font color of the active bar's value badge
 * @param scrollable whether chart canvas should scroll or fit all bars into given dimension
 * @param minBarHeight minimum bar size when `scrollable` is true
 * @param animationType "spring" | "linear" | "none"
 * @param animationConfig custom config for motion when animation is applied
 * @returns HorizontalBarChart component
 */
export interface HorizontalBarChartProps {
  width: number;
  height: number;
  data: BarDataItem[];
  color?: string;
  activeColor?: string;
  barGap?: number;
  bend?: number;
  numXLabels?: number;

  fontSize?: number;

  labelFontColor?: string;
  labelActiveFontColor?: string;
  badgeBackgroundColor?: string;
  badgeFontColor?: string;

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
