export type CalenderDataPoint = {
  date: Date;
  value: number;
};

// See HeatMapProps for details on the common fields
export interface CalendarHeatMapProps {
  width: number;
  height: number;
  data: CalenderDataPoint[];

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

  // see cellToDate below. Caller never
  // has to think about row/col, only about the calendar day that was tapped.
  // What happens is upto caller
  // like heatmap we don't probably need row and col values here
  onPress?: (date: Date, value: number) => void;
}
