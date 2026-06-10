// Types
export interface PieDataPoint {
  label: string;
  value: number;
  color: string;
}

export interface PieProps {
  // user passes height and width of the canvas
  // we will compute radius and center from that
  // this approach is better for keeping some padding and space for rendering labels
  // could be weird for user though ?
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
}