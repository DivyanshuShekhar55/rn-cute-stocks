// Types
export interface PieDataPoint {
  label: string;
  value: number;
  color: string;
}

/**
 * @param width width of the pie chart container
 * @param height height of the pie chart container
 * @param data data to use for rendering chart
 * @param donut (optional) if true, renders a donut chart, otherwise a pie chart
 * @param innerRadiusRatio (optional) when using a donut chart, the ratio of inner to outer radius (<1)
 * @param labelBgColor (optional) background color for label to show when a slice is selected
 * @param labelFontColor (optional) font color for the label information
 * @param activeSlicePop (optional) factor by which outer radius of a slice increases when selected
 */
export interface PieProps {
  // user passes height and width of the canvas
  // we will compute radius and center from that
  // this approach is better for keeping some padding and space for rendering labels
  width: number;
  height: number;
  data: PieDataPoint[];
  // pass true + inner radius to convert pie to donut
  // default will be false
  donut?: boolean;
  // when donut==true, pass a number between 0-1
  // ratio of inner/outer radius
  // deafult is 0.6
  innerRadiusRatio?: number;
  labelBgColor?: string;
  labelFontColor?: string;
  activeSlicePop?:number
}