export type CalenderDataPoint = {
  date: Date;
  value: number;
};

/**
 * @param width width of the screen to draw cells and label
 * @param height height of the cell-grid view
 * @param data data points used to render cells (of type `CalendarDataPoint[]`)
 * @param onPress callback function when a cell is tapped
 *  `onPress: (date:Date, value:number) => void;
 * @param startDate (optional) when to start the calendar's 1irst cell with
 * @param cellWidth (optional) minimum width of cells. Required when `scrollable = true`
 * @param emptyColor (optional) color of cell if value is undefined / missing
 * @param initialColor (optional) color for value of cell = 0
 * @param finalColor (optional) color shown for maximum value in the cells
 * @param colorSteps (optional) number of divisions to split initial to final color range
 * @param backgroundColor (optional) background color of the grid view
 * @param rowGap (optional) gap (in px) between two consecutive rows
 * @param colGap (optional) gap (in px) between two consecutive columns
 * @param roundedness (optional) border radius of cells
 * @param showLabels (optional) to show the day and month labels or not
 * @param labelStyle (optional) font size and color for the labels
 */

// TODO : should we add jsthrottle ms and buffered cols?

export interface CalendarHeatMapProps {
  width: number;
  height: number;
  data: CalenderDataPoint[];

  // see cellToDate below. Caller never
  // has to think about row/col, only about the calendar day that was tapped.
  // What happens is upto caller
  // like heatmap we don't probably need row and col values here
  onPress?: (date: Date, value: number) => void;

  // default = Jan 1 of current year. Range rendered is always exactly one year forward from this date
  // "past year" style heatmap
  startDate?: Date;
  cellWidth?: number;

  emptyColor?: string;
  initialColor?: string;
  finalColor?: string;
  colorSteps?: number;

  backgroundColor?: string;
  rowGap?: number;
  colGap?: number;

  roundedness?: number;

  showLabels?: boolean; // controls BOTH weekday labels and month labels

  labelStyle?: { fontSize: number; color: string };

  bufferedCols?:number
  jsThrottleMs?:number

}
