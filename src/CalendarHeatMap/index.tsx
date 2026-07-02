import { View, Text, Platform } from "react-native";
import React, { useMemo } from "react";
import {
  DenseHeatMapDataPoint,
  SparseHeatMapDataPoint,
} from "../HeatMap/types";
import HeatMap from "../HeatMap";
import { matchFont } from "@shopify/react-native-skia";
import { Text as SkiaText } from "@shopify/react-native-skia";
import { CalendarHeatMapProps } from "./types";

// Date to cell math and vice versa
// first day will be Sunday

// take in date from data, and give it a row, col coordinate on the grid
// will also depend on startDate, it will shift coordinates
function dateToCell(date: Date, startDate: Date): { row: number; col: number } {
  const startMidnight = convertToMidnight(startDate);
  const dateMidnight = convertToMidnight(date);

  const daysSinceStart = Math.round(
    (dateMidnight.getTime() - startMidnight.getTime()) / MS_A_DAY,
  );

  // starting day of week
  const startDow = startMidnight.getDay(); // 0=sun, 6=sat

  // fixed 7 rows always
  // so if startdate falls on friday, add 5 + daysSinceStart to reach required cell
  // divide by 7 to get required number of columns to reach there
  const col = Math.floor((daysSinceStart + startDow) / 7);
  const row = dateMidnight.getDay();
  return { row, col };
}

const MS_A_DAY = 24 * 60 * 60 * 1000;

// we can't directly take two dates with timestamps and subtract them to get number of days in between
// so we normalise all dates to start at midnight
// this func takes in a date and returns that same date but timestamp fixated to midnight
function convertToMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Inverse of dateToCell — used to turn a tapped (row, col) back into the
// real calendar date for onPress, without HeatMap itself ever knowing
// dates exist.
function cellToDate(row: number, col: number, startDate: Date): Date {
  const startMidnight = convertToMidnight(startDate);
  const startDow = startMidnight.getDay();
  const daysSinceStart = col * 7 + row - startDow;
  const result = new Date(startMidnight);
  result.setDate(result.getDate() + daysSinceStart);
  return result;
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const DEFAULT_LABEL_STYLE = { fontSize: 10, color: "#666" };

// Skia font object
const fontFamily = Platform.select({ ios: "Helvetica", default: "serif" });

const CalendarHeatMap = ({
  width,
  height,
  data,
  onPress,
  startDate: startDateProp,
  cellWidth = 12,
  emptyColor,
  initialColor,
  finalColor,
  colorSteps,
  backgroundColor,
  rowGap,
  colGap = 3,
  roundedness,
  dayLabels = [1, 3, 5], // Mon, Wed, Fri (row 0 = Sun)
  showLabels = true,
  labelStyle = DEFAULT_LABEL_STYLE,
  bufferedCols = 10, // overwriting the defaults of heatmap (looked cooler on device)
  jsThrottleMs = 150,
}: CalendarHeatMapProps): React.ReactElement => {
  // We will only show days that are marked in dayLabels.
  // Only these weekday rows get a label drawn
  // matches GitHub's own graph and avoids 7 cramped labels down the left edge.
  const LABELLED_ROWS = useMemo(() => {
    return new Set(dayLabels);
  }, [dayLabels]);

  // Default startDate = Jan 1 of current year.
  // Recomputing `new Date()` fresh on every render would be wrong here
  const startDate = useMemo(() => {
    if (startDateProp) return convertToMidnight(startDateProp);
    const now = new Date();

    // first jan of the current year
    return new Date(now.getFullYear(), 0, 1);
  }, [startDateProp]);

  // One year forward from startDate, exclusive — i.e. the range is [startDate, endDate).
  const endDate = useMemo(() => {
    const d = new Date(startDate);
    d.setFullYear(d.getFullYear() + 1);
    return d;
  }, [startDate]);

  // Data transform: CalendarDataPoint[] (date, value) -> SparseHeatMapDataPoint[]
  // (r, c, value), which is the shape the generic HeatMap already understands

  const sparseData = useMemo(() => {
    const points: SparseHeatMapDataPoint[] = [];

    for (let { date, value } of data) {
      // skip points outside the configured range rather than silently
      // wrapping or clamping them into a wrong cell
      if (date < startDate || date >= endDate) continue;
      const { row, col } = dateToCell(date, startDate);
      points.push({ r: row, c: col, value });
    }

    return points;
  }, [data, startDate, endDate]);

  // Total columns needed to cover [startDate, endDate) — same +startDow adjustment as dateToCell
  const totalCols = useMemo(() => {
    const lastDay = new Date(endDate);
    lastDay.setDate(lastDay.getDate() - 1); // exclusive of last date
    const { col } = dateToCell(lastDay, startDate); // get col of last date
    return col + 1; // add one because we are satrting count from 0
  }, [startDate, endDate]);

  // Skia font for month labels
  const monthFont = useMemo(
    () =>
      matchFont({
        fontFamily,
        fontSize: labelStyle.fontSize,
        fontStyle: "normal",
        fontWeight: "600",
      }),
    [labelStyle.fontSize],
  );

  // remove the days before start date and after end date
  // no need to render empty cells, just skip them completely
  const isValidCell = (row: number, col: number) => {
    // only the first and last columns can ever be partial — every column in
    // between is a full Sun–Sat week, guaranteed inside range
    if (col > 0 && col < totalCols - 1) return true;
    const date = cellToDate(row, col, startDate);
    return date >= startDate && date < endDate;
  };

  // Month Label
  // exact same as github - mark the month label where the full week belongs to the same month
  // for example if June starts on wednesday (mid of week) then we don't mark that week as June
  // but the next one (because all the dates in that week will belong to June)
  const monthLabels = useMemo(() => {
    if (!showLabels) return [];
    // store col number of where each string starts
    const labels: { col: number; text: string }[] = [];
    // tracks what month we last saw (starts at -1, nothing seen)
    let lastMonthKey = -1;

    // walk week by week, check if full week belongs to a new month
    // if new month mark and move ahead
    for (let col = 0; col < totalCols; col++) {
      // first date in the week (row=0 or sunday)
      const date = cellToDate(0, col, startDate);
      // For that week's Sunday, also check the next 6 days (Mon through Sat)
      for (let d = 0; d < 7; d++) {
        const day = new Date(date);
        day.setDate(day.getDate() + d);
        if (day < startDate || day >= endDate) continue;

        // A single number that uniquely identifies "this specific month of this specific year" (like jan 2025 vs jan 2026)
        // current month + (current_year*12) makes it unique
        // just adding year and month wont be enough: jan 2026 (2026+0) vs feb 2025 (2025+1)
        const monthKey = day.getFullYear() * 12 + day.getMonth();

        // If this day's month is different from the last month we recorded, that means we just crossed into a new month
        if (monthKey !== lastMonthKey) {
          lastMonthKey = monthKey;
          labels.push({ col, text: MONTH_NAMES[day.getMonth()] });
        }
      }
    }
    return labels;
  }, [showLabels, totalCols, startDate, endDate]);

  // fraction of height reserved for month labels — only when showLabels.
  // Picked relative to font size so it scales sensibly across label sizes,
  // take at max 25% of height
  const xLabelHeight = showLabels
    ? Math.min(0.25, (labelStyle.fontSize + 8) / height)
    : 0;
  const labelAreaHeight = xLabelHeight * height;

  // Wrapped onPress — re-derive the real Date from (row, col)
  // tapped cell had no data point (HeatMap already returns early in that
  const handleHeatMapPress = (
    // we had to use dense point just to match HeatMap's TS signature
    item: SparseHeatMapDataPoint | DenseHeatMapDataPoint,
    _index: number,
    row: number,
    col: number,
  ) => {
    if (!onPress) return;
    const date = cellToDate(row, col, startDate);
    onPress(date, item.value);
  };

  const renderMonthLabels = (layout: {
    cellWidth: number;
    colGap: number;
  }): React.ReactNode => {
    if (!showLabels) return null;
    const colWidthWithGap = layout.cellWidth + layout.colGap;
    return monthLabels.map(({ col, text }) => (
      <SkiaText
        key={`${text}-${col}`}
        // starting col gap + N number of columns = current x
        x={layout.colGap + col * colWidthWithGap}
        // overlayContent renders inside the SAME <Group> as the cells, with
        // no extra transform of its own — so y here is plain canvas-
        // absolute, identical coordinate space to the cells themselves.
        // The cells already start at y = labelAreaHeight (see HeatMap's
        // buildCell), so the reserved strip for labels is y ∈ [0,
        // labelAreaHeight). We sit the label baseline a few px above that
        // boundary, inside the strip, just above row 0.
        y={labelAreaHeight - 4}
        text={text}
        font={monthFont}
        color={labelStyle.color}
      />
    ));
  };

  // reduce the width of grid to make space for day labels
  // calculate the text width based on font size
  const dayLabelWidth = useMemo(() => {
    if (!showLabels || !monthFont) return 0;
    const widths = ["Mon", "Wed", "Fri"].map((d) => monthFont.getTextWidth(d));
    return Math.min(40, Math.max(...widths) + 8); // longest label + padding, capped
  }, [showLabels, monthFont]);

  const heatMapWidth = width - dayLabelWidth;
  const heatMapRowHeight = (height - labelAreaHeight) / 7; // always 7 rows (Sun..Sat)

  // Day names are on left and normal RN text since a few text components wont be heavy to render
  // month labels need to scroll along with the grid so pass as skia to HeatMap component
  // HeatMap itself takes care of scrolling (as overlay content)

  return (
    <View style={{ width, height }}>
      <View
        style={{
          flexDirection: "row",
          height,
          backgroundColor: backgroundColor,
        }}
      >
        {showLabels && (
          <View style={{ width: dayLabelWidth, height }}>
            {[0, 1, 2, 3, 4, 5, 6].map((row) =>
              LABELLED_ROWS.has(row) ? (
                <Text
                  key={row}
                  style={{
                    position: "absolute",
                    // center the label within its row: start at row's top, then push
                    // down by half the leftover space (row height minus text height)
                    top:
                      labelAreaHeight +
                      row * heatMapRowHeight +
                      (heatMapRowHeight - labelStyle.fontSize) / 2,
                    fontSize: labelStyle.fontSize,
                    fontFamily, // match the Skia month-label font family for visual consistency
                    color: labelStyle.color,
                  }}
                >
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][row]}
                </Text>
              ) : null,
            )}
          </View>
        )}

        <HeatMap
          width={heatMapWidth}
          height={height}
          data={sparseData}
          rows={7}
          columns={totalCols}
          cellWidth={cellWidth}
          scrollable={true} // always true for calendar — never a prop, per design
          xLabelHeight={xLabelHeight}
          emptyColor={emptyColor}
          initialColor={initialColor}
          finalColor={finalColor}
          colorSteps={colorSteps}
          backgroundColor={backgroundColor}
          rowGap={rowGap}
          colGap={colGap}
          roundedness={roundedness}
          overlayContent={renderMonthLabels}
          onPress={handleHeatMapPress}
          validateCell={isValidCell}
          bufferedCols={bufferedCols}
          jsThrottleMs={jsThrottleMs}
        />
      </View>
    </View>
  );
};

export default CalendarHeatMap;
