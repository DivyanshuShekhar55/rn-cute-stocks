/**
 * Allow data to be rendered in a cell-by-cell fashion (column major format).
 * No need to pass in `( row, col )` coordinate.
 *
 */
export type DenseHeatMapDataPoint = {
  value: number;
};

/**
 * Explicitly provide the value and cell coordinate to render the heatmap.
 */
export type SparseHeatMapDataPoint = {
  r: number;
  c: number;
  value: number;
};

/**
 * The HeatMapData chooses one of the `DenseHeatMapDataPoint[]` or `DenseHeatMapDataPoint[]` for data type.
 * Auto decision made by looking at the first data point.
 */
export type HeatMapData = DenseHeatMapDataPoint[] | SparseHeatMapDataPoint[];

/**
 * Every cell has a unique identification.
 *
 * x, y -> Skia's canvas coordinate of the Rect.
 *
 * row, col -> the row and column to which the cell belongs.
 * TODO : are these absolue positions or logical (ie based on current viewport)
 */
export type GridValue = {
  cellColor: string;
  x: number;
  y: number;
  index: number; // flat index — for dense this maps back into `data`; for sparse it's just a stable key for RoundedRect
  row: number;
  col: number;
};

// TODO :
// check for numerical data inconsistencies
// allow users to have gaps between labels like gap=2 will render labels at gap of 2 cells
// labels aren't necessary at all, can have just painted cells
export interface HeatMapProps {
  width: number;
  height: number;
  data: HeatMapData;
  rows: number;

  columns?: number; // Calculated automatically, provided only if user wants to put a hard cap on upper limit

  emptyColor?: string; // Color for completely missing slots, default = #f3f4f6
  initialColor?: string; // Freq = 0, default = #e8d5f5
  finalColor?: string; // Freq = Max, default = #6b21a8
  colorSteps?: number; // number of divisions from init to final color default=4
  backgroundColor?: string; // default = transparent

  rowGap?: number; // default=4px
  colGap?: number; // default=8px
  roundedness?: number; // default = 4px

  // TODO: cellType?: "rect" | "circle" | "path";  TODO : for later

  // when app user presses a box what happens is upto the library user
  // all we do is provide the data and the index on datum (in the data array) along with (row, col) in the grid
  // for sparse data with no entry at the tapped cell, onPress is not called at all
  onPress: (
    item: SparseHeatMapDataPoint | DenseHeatMapDataPoint,
    index: number,
    row: number,
    col: number,
  ) => void;

  // Horizontal-only, same reasoning as VerticalBarChart: columns can overflow
  // the viewport, rows never do for this chart's intended use cases
  scrollable?: boolean; // default = false
  // one difference from bar charts however : we dont have any min width crossing which we start scroll
  // the min width must be provided by the user. I made this decision because
  // arbitrary cell width would not look "cute". Something I believe user must specify.
  // Required when scrollable=true — with columns able to exceed the viewport
  cellWidth?: number;

  // Fraction of height reserved at the TOP of the canvas for label content
  // needs to scroll with the grid — same convention as VerticalBarChart's xAxisHeight/yAxisWidth
  // default = 0, meaning the grid starts at
  // y=0 same as before this prop existed. The grid itself shrinks to fit
  // the remaining (1 - xLabelHeight) * height, it does NOT grow height.
  xLabelHeight?: number; // e.g. 0.1 = top 10% of height reserved for labels

  // Escape hatch for callers (e.g. CalendarHeatmap) who need to draw extra
  // Skia content that scrolls in lockstep with the cell grid — month
  // labels being the motivating case. HeatMap has no idea what this content is
  // it just renders whatever nodes the function returns INSIDE the same
  // scrolling <Group> as the cells, so it never drifts out of sync with
  // them. Receives the same numbers HeatMap itself uses to position cells,
  // so the caller can place things using identical math.
  overlayContent?: (layout: {
    cellWidth: number;
    cellHeight: number;
    rowGap: number;
    colGap: number;
    totalCols: number;
    rows: number;
  }) => React.ReactNode;

  // number of columns to buffer on either side of current grid window
  // helps avoid flickering presentation of cells as user scrolls
  bufferedCols?: number 
  jsThrottleMs?: number;
}