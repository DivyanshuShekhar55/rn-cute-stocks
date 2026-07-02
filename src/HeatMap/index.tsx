// The heatmap is a generic container for cells.
// It doesn't take labels or anything, its main job is to render cells.
// It isn't there to render labels because heatmaps can have very different ways to handle labels.
// Some might expect it to be rendered after every Nth column or Nth row
// some might give a few columns and want them to repeat (days of week)
// some might want increasing columns (week-1, week-2, ...)
// some might need special ways to render (calender heatmap will put a new month's label wherever first week of month appears)
//
// So we simply render cells here and provide a overlayContent prop that users can use to render chart as they wish.
// KISS principle (Keep It Simple, Stupid)

import React, { useMemo, useState } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Canvas, Group, RoundedRect } from "@shopify/react-native-skia";
import {
  useSharedValue,
  withDecay,
  useAnimatedReaction,
  type DerivedValue,
  useDerivedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import {
  DenseHeatMapDataPoint,
  GridValue,
  HeatMapData,
  HeatMapProps,
  SparseHeatMapDataPoint,
} from "./types";
import { max } from "../math/array/minMax";

// ---------------------------------------------------------------------------
// Color interpolation helpers

// Parse a hex color string (#rrggbb or #rgb) into [r, g, b] components
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  // expand shorthand #rgb → #rrggbb
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Convert [r, g, b] back to a #rrggbb string
function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")
  );
}

// Given a normalised t in [0, 1], return a color linearly interpolated
// between `from` and `to`. t=0 → from, t=1 → to.
function lerpColor(from: string, to: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(from);
  const [r2, g2, b2] = hexToRgb(to);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

// Map a raw value to one of `colorSteps` discrete colors between
// initialColor (value = 0) and finalColor (value = max).
// Returns initialColor when value = 0 and finalColor when value = max.
function valueToColor(
  value: number,
  maxValue: number | undefined,
  initialColor: string,
  finalColor: string,
  colorSteps: number,
): string {
  if (maxValue === 0 || maxValue === undefined || value <= 0)
    return initialColor;
  // clamp t to [0, 1], then snap to the nearest discrete step
  const t = Math.min(value / maxValue, 1);
  const snapped = Math.round(t * (colorSteps - 1)) / (colorSteps - 1);
  return lerpColor(initialColor, finalColor, snapped);
}

// We need this helper function later to check whether the data is sparse or dense
// and also type assert the array if sparse to help TS use the fields in sparse type
function isSparse(data: HeatMapData): data is SparseHeatMapDataPoint[] {
  return data.length > 0 && "r" in data[0];
}

function maxValueOf(data: HeatMapData): number | undefined {
  return max(data, (d) => d.value);
}

// ---------------------------------------------------------------------------
// Component

const HeatMap = ({
  width,
  height,
  data,
  rows,
  onPress,
  columns,
  overlayContent,
  emptyColor = "#f3f4f6",
  initialColor = "#e8d5f5",
  finalColor = "#6b21a8",
  backgroundColor = "transparent",
  colorSteps = 4,
  rowGap = 4,
  colGap = 4,
  roundedness = 4,
  scrollable = false,
  cellWidth: cellWidthProp,
  xLabelHeight = 0,
  validateCell,
  bufferedCols = 10,
  jsThrottleMs = 150,
}: HeatMapProps): React.ReactElement => {
  // ---------------------------------------------------------------------------
  // Grid dimensions

  // will be used multiple times, so better compute once
  const dataLen = data.length;

  // Total number of columns needed to display all data items, given rows per column.
  // If the user passes a hard cap via columns, we respect it and silently truncate.
  // For sparse data, data.length is the count of given points, not grid
  // cells, so this is only a meaningful default for dense
  // sparse users should generally pass columns explicitly. We still derive something
  // sane (max col seen + 1) so it doesn't blow up if they don't.
  const maxCol = isSparse(data) ? (max(data, (d) => d.c) ?? -1) : -1;
  const derivedCols = isSparse(data) ? maxCol + 1 : Math.ceil(dataLen / rows);
  const totalCols =
    columns !== undefined ? Math.min(columns, derivedCols) : derivedCols;

  // Warn in dev if user's column cap causes data to be clipped
  if (__DEV__ && columns !== undefined && derivedCols > columns) {
    console.warn(
      `[HeatMap] columns=${columns} cap clips data. ` +
        `Pass columns=${derivedCols} or omit the prop to show all data.`,
    );
  }

  // Total cells we will actually render (dense-only concept
  // sparse has no "trailing empty cell" notion since position comes from r/c, not order)
  const visibleDataLen = isSparse(data)
    ? dataLen
    : Math.min(dataLen, totalCols * rows);

  // width of one cell:
  // - scrollable: caller-provided, fixed
  // - non-scrollable: available horizontal space
  //   divided by the number of columns, accounting for colGap between every
  //   column and on both outer edges.
  //   totalHorizontalSpace = width - (totalCols + 1) * colGap
  //   cellSize = totalHorizontalSpace / totalCols
  if (__DEV__ && scrollable && cellWidthProp === undefined) {
    console.warn(
      "[HeatMap] scrollable=true requires a `cellWidth` prop — falling back to auto-fit, which defeats scrolling (content will never exceed the viewport).",
    );
  }
  const cellWidth =
    scrollable && cellWidthProp !== undefined
      ? cellWidthProp
      : (width - (totalCols + 1) * colGap) / totalCols;

  // Space reserved at the top for scrolling label content, same fractional convention as
  // VerticalBarChart's xAxisHeight. The grid itself only ever gets the
  // remaining height — this prop shrinks the grid, it never grows the canvas
  const labelAreaHeight = xLabelHeight * height;
  const gridHeight = height - labelAreaHeight;

  // Same logic vertically using rowGap to calculate height
  // if user provides a taller container, cells stretch vertically (non-square).
  // If you want square cells, set height = rows * cellSize + (rows + 1) * rowGap.
  const cellHeight = (gridHeight - (rows + 1) * rowGap) / rows;

  // Logical full content width — only relevant when scrollable. The Canvas
  // itself is NEVER sized to this (see render below); it always stays
  // `width` wide. A canvas sized to fit hundreds of columns can exceed the
  // device's GPU surface limit and crash, same lesson as HorizontalBarChart.
  // so this logical width is used only for calculating the scroll offset
  const contentWidth = totalCols * (cellWidth + colGap) + colGap; // add a col gap after last col
  // how many pixels shall we scroll so we reach the last column ? - maxScroll
  const maxScroll = scrollable ? Math.max(0, contentWidth - width) : 0;

  // ---------------------------------------------------------------------------
  // Data cache — recompute max only when `data` reference changes.

  const maxValue = useMemo(() => maxValueOf(data), [data]);

  // Sparse lookup: row,col -> value. Built once per `data` change
  const sparseMap = useMemo(() => {
    if (!isSparse(data)) return null;
    const map = new Map<string, number>();

    data.forEach((point) => {
      map.set(`${point.r},${point.c}`, point.value);
    });
    return map;
  }, [data]);

  // ---------------------------------------------------------------------------
  // Shared cell builder — both dense and sparse branches funnel through this
  // take in position (row and col) of the cell and the datum
  // convert it to GridValue type (i.e., return where x,y coordinates of a cell on canvas will be)

  const buildCell = (
    row: number,
    col: number,
    index: number,
    value: number | undefined, // undefined = no data point for this cell
  ): GridValue => {
    // for x: initial column gap + number of cols to the cell * the col size
    // the col size is just the sum of cell width and its associated gap
    const x = colGap + col * (cellWidth + colGap);

    // for y: same maths as x, but also cosnider the space taken by labels on top
    const y = labelAreaHeight + rowGap + row * (cellHeight + rowGap);
    const cellColor =
      value === undefined
        ? emptyColor
        : valueToColor(value, maxValue, initialColor, finalColor, colorSteps);
    return { cellColor, x, y, index, row, col };
  };

  // ---------------------------------------------------------------------------
  // Scroll — a shared value driven directly by Pan. No ScrollView at all.
  // Same architecture as VerticalBarChart: one gesture system (Gesture
  // Handler) owns both tap and scroll, so there's no native ScrollView
  // fighting a separate GestureDetector for the same touch. Horizontal only
  // — row axis never scrolls for this chart.

  const scrollX = useSharedValue(0);
  const startScrollX = useSharedValue(0);
  const lastSyncTime = useSharedValue(0);

  // Mirrored into JS state ONLY for the visible-column-slice math below.
  // Updated via a throttled bridge call, NOT every frame — syncing on every
  // frame (60/sec) floods the JS thread with state updates and tanks JS FPS
  // Though the actual cell positions (driven by the Group transform
  // below, UI thread) stay smooth regardless.
  const [scrollOffset, setScrollOffset] = useState(0);
  const syncScrollToJS = (val: number) => setScrollOffset(val);

  useAnimatedReaction(
    () => scrollX.value,
    (current) => {
      if (!scrollable) return;
      const now = Date.now();
      if (now - lastSyncTime.value > jsThrottleMs) {
        lastSyncTime.value = now;
        scheduleOnRN(syncScrollToJS, current);
      }
    },
  );

  // Whole-canvas translate, applied via a Skia <Group> transform instead of
  // recomputing every cell's x position on every pan — we only ever
  // shift the rendered group, not the underlying cellGrid math.
  const groupTransform: DerivedValue<{ translateX: number }[]> =
    useDerivedValue(() => [{ translateX: -scrollX.value }]);

  // ---------------------------------------------------------------------------
  // Build cell list.
  // Dense: column-major so xLabels cycle correctly —
  // col 0 → xLabels[0 % xLabels.length], col 1 → xLabels[1 % xLabels.length], ...
  // outer loop is columns, inner loop is rows within that column.
  // Sparse: iterate every (row, col) in the full `rows x totalCols` grid and
  // look up the value, missing cells get emptyColor via
  // buildCell's undefined branch
  //
  // Virtualised: when scrollable, only build cells for columns actually (or
  // nearly) inside the viewport right now — same reasoning as
  // VerticalBarChart's visible-window slice. At hundreds of columns we still
  // only ever create a couple dozen columns' worth of Skia nodes per render.
  // A small buffer (±4 columns) avoids visible pop-in right at the edge.

  const colWidthWithGap = cellWidth + colGap;
  const firstVisibleCol = scrollable
    ? Math.max(0, Math.floor(scrollOffset / colWidthWithGap) - bufferedCols)
    : 0;

  // since we started buffered number of cols prior to the real/actual first visible col
  // to get the actual last column calculate the num of columns, add first column then add the buffered col
  // adding the buffered column cancels the effect of taking cols prior to actual first column
  // then add another bufferedCol to have a buffer after the actual last visible col
  const lastVisibleCol = scrollable
    ? Math.min(
        totalCols,
        firstVisibleCol + Math.ceil(width / colWidthWithGap) + 2 * bufferedCols,
      )
    : totalCols;

  const cellGrid = useMemo(() => {
    const grid: GridValue[] = [];

    if (isSparse(data) && sparseMap) {
      for (let col = firstVisibleCol; col < lastVisibleCol; col++) {
        for (let row = 0; row < rows; row++) {
          // if cell isn't valid skip adding it at all
          if (validateCell && validateCell(row, col) === false) continue;

          // for example if we have row=4, col=3
          // take 3 columns full and multiply by number of rows in each column
          // so 3*rows. Then add the row passed so it becomes : 3*rows + 4
          const index = col * rows + row;
          // we already constructed a map with "row,col" -> data-value system
          // we have the rows and cols, get the corresponding data item: O(1) lookup
          // value can be undefined, push it anyway, buildCell() will give it an emptyColor
          const value = sparseMap.get(`${row},${col}`);
          // before pushing into grid, calculate the color and x, y position on the Canvas as well
          grid.push(buildCell(row, col, index, value));
        }
      }
      return grid;
    }

    // Dense path
    for (let col = firstVisibleCol; col < lastVisibleCol; col++) {
      for (let row = 0; row < rows; row++) {
        // if cell isn't valid skip adding it at all
        if (validateCell && validateCell(row, col) === false) continue;

        const index = col * rows + row;

        const value =
          index < visibleDataLen
            ? (data[index] as DenseHeatMapDataPoint).value
            : undefined;
        grid.push(buildCell(row, col, index, value));
      }
    }
    return grid;
  }, [
    data,
    sparseMap,
    firstVisibleCol,
    lastVisibleCol,
    rows,
    cellWidth,
    cellHeight,
    visibleDataLen,
    initialColor,
    finalColor,
    colorSteps,
    emptyColor,
    maxValue,
  ]);

  // ---------------------------------------------------------------------------
  // Gestures

  // This will run on the JS thread
  // This is because data lives on the
  const handlePress = (row: number, col: number) => {
    if (isSparse(data) && sparseMap) {
      // from calculated values of row, col get back data item value using the O(1) map lookup
      const value = sparseMap.get(`${row},${col}`);
      if (value === undefined) return; // tapped an empty sparse cell, no-op
      // TODO: why -1 here?
      onPress({ r: row, c: col, value }, -1, row, col);
      return;
    }
    // For dense charts
    // column-major indexing: each column holds `rows` items stacked vertically
    // so using calculated value of row and col, calculate the index in data[]
    const index = col * rows + row;
    const item = (data as DenseHeatMapDataPoint[])[index];
    if (!item) return; // tapped a trailing empty cell, or index out of range
    onPress(item, index, row, col);
  };

  // Hit-test: given (x, y) within the canvas, find which (row, col) was tapped
  // and call onPress with the corresponding data item.
  // IMPORTANT: touch coordinates are always in VIEWPORT space, but cells are
  // laid out in CONTENT space and shifted visually by groupTransform — so we
  // have to add the current scroll, before inverting to col/row
  // runs on UI thread
  const tap = Gesture.Tap().onStart((g) => {
    // Guard against degenerate layouts (rows/totalCols of 0, or a width/height
    // too small for the configured gaps) producing NaN/Infinity cell sizes
    if (
      rows <= 0 ||
      totalCols <= 0 ||
      !Number.isFinite(cellWidth) ||
      !Number.isFinite(cellHeight)
    ) {
      return;
    }

    // extract pure (x,y) coordinates of the touch
    // calculate the logical x by adding pixels we have already scrolled
    const { x, y } = g;
    const contentX = x + scrollX.value;
    // the touch wasn't at 'y' pixels in the chart
    // the touch was at y-labelAreaHeight pixels from top
    // this would give us the actual row and col
    const contentY = y - labelAreaHeight;
    // Invert the cell position formula: col = (x - colGap) / (cellSize + colGap)
    // check the buildCell() function to see how we extracted the x and y coordinates of cells
    const col = Math.floor((contentX - colGap) / (cellWidth + colGap));
    const row = Math.floor((contentY - rowGap) / (cellHeight + rowGap));
    // check if touch was valid and landed on a cell
    if (col < 0 || col >= totalCols || row < 0 || row >= rows) return;

    scheduleOnRN(handlePress, row, col); // runs on JS
  });

  // Pan — horizontal only. Same shape as VerticalBarChart's panGesture
  // runs on UI thread
  const pan = Gesture.Pan()
    .onStart(() => {
      "worklet";
      startScrollX.value = scrollX.value;
    })
    .onUpdate((e) => {
      "worklet";
      // dragging right (translationX positive) should reveal content to the
      // LEFT — i.e. scroll position decreases
      const next = startScrollX.value - e.translationX;
      scrollX.value = Math.max(0, Math.min(maxScroll, next));
    })
    .onEnd((e) => {
      "worklet";
      scrollX.value = withDecay(
        { velocity: -e.velocityX, clamp: [0, maxScroll] },
        () => {
          // decay has fully settled — do one final JS sync so the rendered
          // column window matches the exact resting position, since the
          // throttle above might leave it stale otherwise
          scheduleOnRN(syncScrollToJS, scrollX.value);
        },
      );
    });

  // Only one of tap or pan can become active per touch — Gesture Handler
  // itself decides which, based on whether the finger moved or stayed still.
  // Pan is listed first, giving it priority if botha are applied at same time.
  // If however not scrollable we just use the tap gesture
  const composedGesture = scrollable ? Gesture.Exclusive(pan, tap) : tap;

  // ---------------------------------------------------------------------------
  // Cell renderer — pure function returning a Skia node, called inside canvas

  const RenderCell = (cell: GridValue): React.ReactNode => {
    return (
      <RoundedRect
        key={`${cell.row}-${cell.col}`}
        width={cellWidth}
        height={cellHeight}
        color={cell.cellColor}
        x={cell.x}
        y={cell.y}
        r={roundedness}
      />
    );
  };

  // Two-layer memo: `cellGrid` above caches the math (positions/colors),
  // this layer caches the JSX so a change in `roundedness` alone doesn't
  // force recomputing every cell's color.
  const cells: React.ReactNode[] = useMemo(
    () => cellGrid.map((cell) => RenderCell(cell)),
    [cellGrid, roundedness],
  );

  // ---------------------------------------------------------------------------
  // Render
  // Canvas is ALWAYS `width` wide, regardless of contentWidth — virtualised
  // slice above + the Group transform below are what make scrolling work
  // without ever drawing a canvas sized to the full (possibly huge) content.

  return (
    <GestureDetector gesture={composedGesture}>
      <Canvas
        style={{
          width: width,
          height: height,
          backgroundColor: backgroundColor,
        }}
      >
        {scrollable ? (
          <Group transform={groupTransform}>
            {cells}
            {overlayContent?.({
              cellWidth,
              cellHeight,
              rowGap,
              colGap,
              totalCols,
              rows,
            })}
          </Group>
        ) : (
          cells
        )}
      </Canvas>
    </GestureDetector>
  );
};

export default HeatMap;
