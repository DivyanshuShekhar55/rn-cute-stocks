/**
 * Allow data to be rendered in a cell-by-cell fashion (column major format).
 * No need to pass in `( row, col )` coordinate.
 */
export type DenseHeatMapDataPoint = {
  value: number;
};

/**
 * Explicitly provide the value and cell coordinate (row, col) to render the heatmap.
 */
export type SparseHeatMapDataPoint = {
  r: number;
  c: number;
  value: number;
};

/**
 * The HeatMapData chooses one of the `DenseHeatMapDataPoint[]` or `SparseHeatMapDataPoint[]` for data type.
 * Auto decision made by looking at the first data point.
 */
export type HeatMapData = DenseHeatMapDataPoint[] | SparseHeatMapDataPoint[];

/**
 * Every cell has a unique identification.
 *
 * x, y -> Skia's canvas coordinate of the Rect.
 *
 * row, col -> the row and column to which the cell belongs.
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

/**
 * @param width width of the screen to draw cells and label
 * @param height height of the cell-grid view
 * @param data data points used to render cells (of type `HeatMapData`)
 * @param rows number of rows of cells in grid
 * @param onPress callback function when a cell is tapped
 *  `onPress: ( item: SparseHeatMapDataPoint | DenseHeatMapDataPoint, index: number, row: number, col: number) => void;`
 * @param scrollable (optional) if cells do not fit in current viewport, to provide scroll or not
 * @param cellWidth (optional) minimum width of cells. Required when `scrollable = true`
 * @param columns (optional) number of columns in the grid. Auto calculated if undefined
 * @param emptyColor (optional) color of cell if value is undefined / missing
 * @param initialColor (optional) color for value of cell = 0
 * @param finalColor (optional) color shown for maximum value in the cells
 * @param colorSteps (optional) number of divisions to split initial to final color range
 * @param backgroundColor (optional) background color of the grid view
 * @param rowGap (optional) gap (in px) between two consecutive rows
 * @param colGap (optional) gap (in px) between two consecutive columns
 * @param roundedness (optional) border radius of cells
 * @param xLabelHeight (optional) fraction of grid's height to be used for x labels
 * @param overlayContent (optional) for callers of HeatMap component that need to draw extra skia components along side the cells (like labels)
 * @param bufferedCols (optional) number of columns buffered on both side of current visible window (if scrollable), to avoid flickering entry of new columns
 * @param jsThrottleMs (optional) time in ms after which to update the js thread states during scrolls
 */

export interface HeatMapProps {
  width: number;
  height: number;
  data: HeatMapData;
  rows: number;

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
  bufferedCols?: number;
  jsThrottleMs?: number;
}
