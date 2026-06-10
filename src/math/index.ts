import {
  curveBasis,
  curveBumpX,
  curveLinear,
  curveMonotoneX,
  curveNatural,
  line,
} from "d3-shape";

import { max, min } from "d3-array";
import { scaleLinear, scalePoint, scaleTime } from "d3-scale";

export type CurveType =
  | "curveBasis"
  | "curveBumpX"
  | "curveLinear"
  | "curveMonotoneX"
  | "natural";

export type SearchAlgorithm = "binarySearchWithInterpolation";

export interface YForXResult {
  yCoord: number;
  actualVal: number;
}

export interface CandleStickPoint {
  low: number;
  high: number;
}

// types explicitly fot the timeseries chart
export interface TimeSeriesDataPoint {
  x: number; // unix ms
  y: number;
}

interface TimeSeriesPathResult {
  strPath: string | null;
  xFunc: ReturnType<typeof scaleTime>;
  yFunc: ReturnType<typeof scaleLinear<number, number>>;
  data: TimeSeriesDataPoint[];
  xRangeMin: number;
  xRangeMax: number;
}

interface TimerSeriesPathConfig extends TimeSeriesPathResult {
  canvasWidth: number;
  canvasHeight: number;
}

// types for the linear chart (normal one)
// can have x label of any type user passes in, not strictly timestamp
export interface LineDataPoint {
  x: string;
  y: number;
}

interface LineChartPathResult {
  strPath: string | null;
  xFunc: ReturnType<typeof scalePoint<string>>;
  yFunc: ReturnType<typeof scaleLinear<number, number>>;
  data: LineDataPoint[];
  xRangeMin: number;
  xRangeMax: number;
  step: number;
}

interface LineChartPathConfig extends LineChartPathResult {
  canvasWidth: number;
  canvasHeight: number;
}

function getCurve(curveType: CurveType) {
  let curve;

  // following are curves I believe are good matches for line chart data
  switch (curveType) {
    case "curveBasis":
      curve = curveBasis;
      break;
    case "curveBumpX":
      curve = curveBumpX;
      break;
    case "curveLinear":
      curve = curveLinear;
      break;
    case "curveMonotoneX":
      curve = curveMonotoneX;
      break;
    case "natural":
      curve = curveNatural;
      break;
    default:
      curve = curveBasis;
      console.warn(
        "Invalid curve, falling back to default bezier (curveBasis)",
      );
      break;
  }
  return curve;
}

// build y axis for line chart
// will be common for both generic line chart and timee series chart, only the x axis differs
// we only pass around the y axis data
function buildYScale(
  data: { y: number }[],
  canvasHeight: number,
): ReturnType<typeof scaleLinear<number, number>> {
  const minY =
    min(data, (d) => {
      return d.y;
    }) ?? 0;
  const maxY =
    max(data, (d) => {
      return d.y;
    }) ?? 1;

  //  we don't want to smash the coordinates into the chart's edges
  // we keep some breathing space with 10%
  // add this padding below the min and above the max
  const yPadding = (maxY - minY) * 0.1;

  const yFunc = scaleLinear()
    .domain([minY - yPadding, maxY + yPadding])
    .range([canvasHeight, 0]);

  return yFunc;
}

function GenerateStringPath_TimeSeries(
  curveType: CurveType,
  data: TimeSeriesDataPoint[],
  canvasWidth: number,
  canvasHeight: number,
) {
  const curve = getCurve(curveType);

  const X_PADDING = Math.max(8, canvasWidth * 0.05);

  const minX =
    min(data, (d) => {
      return d.x;
    }) ?? 0;
  // Note : ideally the min/max functions should not return undefined
  // any bad data or empty data should be caught at react  component itself when passing the data
  // keeping a 0 is weird, but safe, saves from crash
  const maxX =
    max(data, (d) => {
      return d.x;
    }) ?? 1;

  const xFunc = scaleTime()
    .domain([minX, maxX])
    .range([X_PADDING, canvasWidth - X_PADDING]);
  // now we can call like x(someTimestampValue)
  // this is done while plotting the path like line().x((d) => x(d.timestamp))

  const yFunc = buildYScale(data, canvasHeight);

  const strPath = line<TimeSeriesDataPoint>()
    .x((d) => xFunc(d.x) as number)
    .y((d) => yFunc(d.y))
    .curve(curve)(data);

  return {
    strPath,
    xFunc,
    yFunc,
    data,
    xRangeMin: X_PADDING,
    xRangeMax: canvasWidth - X_PADDING,
  };
}

// is used to cache
let TIMESERIES_PATH_CONFIG: TimerSeriesPathConfig | null = null;

function GetYForX_TimeSeries(
  xPos: number,
  canvasWidth: number,
  data: TimeSeriesDataPoint[],
  canvasHeight: number,
  ySearchAlgorithm: SearchAlgorithm,
): YForXResult {
  // IDEA BEHIND THIS FUNC. :
  // the curve is not linear so find two nearby points for the given X (timestamp)
  // then assume them as a linear line and get Y via linear interpolation
  // also cache the path configs

  // if data, resolution changes updated the cached data
  if (
    !TIMESERIES_PATH_CONFIG ||
    TIMESERIES_PATH_CONFIG.canvasWidth !== canvasWidth ||
    TIMESERIES_PATH_CONFIG.canvasHeight !== canvasHeight ||
    TIMESERIES_PATH_CONFIG.data.length !== data.length
  ) {
    TIMESERIES_PATH_CONFIG = {
      ...GenerateStringPath_TimeSeries(
        "curveBumpX",
        data,
        canvasWidth,
        canvasHeight,
      ),
      canvasWidth: canvasWidth,
      canvasHeight: canvasHeight,
    };
  }

  const { xFunc, yFunc, xRangeMin, xRangeMax } = TIMESERIES_PATH_CONFIG;

  // keep x within bounds by clamping it
  let clampedXPos = Math.max(xRangeMin, Math.min(xRangeMax, xPos));

  let res = searchStrategy_TimeSeries(
    ySearchAlgorithm,
    clampedXPos,
    xFunc,
    data,
    yFunc,
  );

  return res;
}

const searchStrategy_TimeSeries = (
  searchStrategy: SearchAlgorithm,
  clampedXPos: number,
  xFunc: ReturnType<typeof scaleTime>,
  data: TimeSeriesDataPoint[],
  yFunc: ReturnType<typeof scaleLinear<number, number>>,
): YForXResult => {
  switch (searchStrategy) {
    case "binarySearchWithInterpolation":
      return binarySearch_TimeSeries(clampedXPos, xFunc, data, yFunc);
      break;

    // TODO: might add more strategies later
    // one might be using lookup tables
    // as for less data points interpolation fails

    default:
      console.warn(
        "invalid search strategy, falling back to binary with interpolation",
      );
      return binarySearch_TimeSeries(clampedXPos, xFunc, data, yFunc);
      break;
  }
};

const binarySearch_TimeSeries = (
  clampedXPos: number,
  xFunc: ReturnType<typeof scaleTime>,
  data: TimeSeriesDataPoint[],
  yFunc: ReturnType<typeof scaleLinear<number, number>>,
): YForXResult => {
  let timestamp = xFunc.invert(clampedXPos).getTime();

  let leftIdx = 0;

  if (timestamp <= data[0].x) {
    const p = data[0].y;
    return { yCoord: yFunc(p), actualVal: p };
  }
  if (timestamp >= data[data.length - 1].x) {
    const p = data[data.length - 1].y;
    return { yCoord: yFunc(p), actualVal: p };
  }

  // Binary search for the two timestamps that straddle our target
  // could have gone with linear search as well but lol why not better
  let left = 0;
  let right = data.length - 1;

  while (left < right - 1) {
    const mid = Math.floor((left + right) / 2);
    if (data[mid].x <= timestamp) {
      left = mid;
    } else {
      right = mid;
    }
  }

  if (left >= data.length - 1) left = data.length - 2;

  leftIdx = left;

  const leftPoint = data[leftIdx];
  const rightPoint = data[leftIdx + 1];

  // do Linear interpolation here
  const denominator = rightPoint.x - leftPoint.x;
  const ratio =
    denominator !== 0 ? (timestamp - leftPoint.x) / denominator : 0;
  const yVal = leftPoint.y + ratio * (rightPoint.y - leftPoint.y);

  let actualVal = yVal;
  let yCoord = yFunc(yVal);
  return { yCoord, actualVal };
};

// Find the domain (min and max values) from candlestick data
const FindDomain = (data: CandleStickPoint[]): [number, number] => {
  let mini = min(data, (d) => d.low) ?? 0;
  let maxi = max(data, (d) => d.high) ?? 1;
  return [mini, maxi];
};

// generates the string path for generic line chart
function GenerateStringPath(
  curveType: CurveType,
  data: LineDataPoint[],
  canvasWidth: number,
  canvasHeight: number,
): LineChartPathResult {
  const curve = getCurve(curveType);
  const X_PADDING = Math.max(8, canvasWidth * 0.05);

  const xFunc = scalePoint<string>()
    .domain(data.map((d) => d.x))
    .range([X_PADDING, canvasWidth - X_PADDING]);

  const yFunc = buildYScale(data, canvasHeight);

  const strPath = line<LineDataPoint>()
    .x((d) => xFunc(d.x) ?? 0)
    .y((d) => yFunc(d.y))
    .curve(curve)(data);

  // scalePoint spaces points evenly (linear) so step is constant — precompute for O(1) lookup
  // no need for a search strategy like in case of timeseries chart (non-linear)
  // (final_x - initial_x) / total data points
  const step =
    data.length > 1
      ? (canvasWidth - X_PADDING - X_PADDING) / (data.length - 1)
      : 0;

  return {
    strPath,
    xFunc,
    yFunc,
    data,
    xRangeMin: X_PADDING,
    xRangeMax: canvasWidth - X_PADDING,
    step,
  };
}

let LINECHART_PATH_CONFIG: LineChartPathConfig | null = null;

function GetYForX(
  xPos: number,
  canvasWidth: number,
  data: LineDataPoint[],
  canvasHeight: number,
): YForXResult {
  if (
    !LINECHART_PATH_CONFIG ||
    LINECHART_PATH_CONFIG.canvasWidth !== canvasWidth ||
    LINECHART_PATH_CONFIG.canvasHeight !== canvasHeight ||
    LINECHART_PATH_CONFIG.data.length !== data.length
  ) {
    LINECHART_PATH_CONFIG = {
      ...GenerateStringPath("curveBumpX", data, canvasWidth, canvasHeight),
      canvasWidth,
      canvasHeight,
    };
  }

  const { xFunc, yFunc, xRangeMin, xRangeMax, step } =
    LINECHART_PATH_CONFIG;
  const clamped = Math.max(xRangeMin, Math.min(xRangeMax, xPos));

  return linechartLookup(clamped, data, yFunc, xRangeMin, step);
}

function linechartLookup(
  clampedXPos: number,
  data: LineDataPoint[],
  yFunc: ReturnType<typeof scaleLinear<number, number>>,
  xRangeMin: number,
  step: number,
): YForXResult {
  if (step === 0) {
    const p = data[0]?.y ?? 0;
    return { yCoord: yFunc(p), actualVal: p };
  }

  // scalePoint is evenly spaced so index = round((x - range_min) / step) — O(1), no loop
  // clamped_x is user's finger position on x axis
  // so we calculate distance fdrom left most edge to current position (clamped-x_range_min)
  // thne divide by width of a singel data point
  // immediately returns us current data index where finger is
  const rawIndex = (clampedXPos - xRangeMin) / step;
  const leftIndex = Math.max(
    0,
    Math.min(Math.floor(rawIndex), data.length - 2),
  );
  const rightIndex = leftIndex + 1;

  const leftPoint = data[leftIndex];
  const rightPoint = data[rightIndex];

  // Linear interpolation between the two neighbouring points
  const ratio = rawIndex - leftIndex; // fractional part — how far between left and right
  const yVal = leftPoint.y + ratio * (rightPoint.y - leftPoint.y);

  return { yCoord: yFunc(yVal), actualVal: yVal };
}

export {
  GenerateStringPath_TimeSeries,
  GetYForX_TimeSeries,
  FindDomain,
  GenerateStringPath,
  GetYForX,
};