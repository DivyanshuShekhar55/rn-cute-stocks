import {
  curveBasis,
  curveBumpX,
  curveLinear,
  curveMonotoneX,
  curveNatural,
  line,
} from "d3-shape";

import { max, min } from "./array/minMax";
import { scaleLinear, scalePoint, scaleTime } from "./scale/index";
import { CurveType, YForXResult } from "../shared/types";
import {
  TimeSeriesDataPoint,
  TimeSeriesPathResult,
} from "../TimeSeriesChart/types";
import { Candle } from "../CandleStickChart/types";
import { LineChartPathResult, LineDataPoint } from "../LineChart/types";

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
): ReturnType<typeof scaleLinear> {
  const minY =
    min(data, (d) => {
      return d.y;
    }) ?? 0;
  const maxY =
    max(data, (d) => {
      return d.y;
    }) ?? 1;

  // we recently encountered an error where if all points are equal or there is just a single data point
  // chart would crash, this is because the scale would crash as maxVal-minVal = 0
  // so we add a check against span, if span = 0, make padding = 1px
  const span = maxY - minY;

  //  we don't want to smash the coordinates into the chart's edges
  // we keep some breathing space with 10%
  // add this padding below the min and above the max
  // so we keeep padding as 10% of span
  const yPadding = span === 0 ? 1 : span * 0.1; // fallback padding keeps domain non-degenerate

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

  // guard zero-span domain (single point) and all equal points — fall back to a 1ms-wide window
  // so scaleTime has a valid non-zero range to map from
  const xDomainMax = minX === maxX ? maxX + 1 : maxX;

  const xFunc = scaleTime()
    .domain([minX, xDomainMax])
    .range([X_PADDING, canvasWidth - X_PADDING]);
  // now we can call like x(someTimestampValue)
  // this is done while plotting the path like line().x((d) => x(d.timestamp))

  const yFunc = buildYScale(data, canvasHeight);

  // our scale function (in math/scale/time) returns number or undefined
  // undefined is returned for NaNs, or undefined or null datums
  // but the "line" function from d3 accepts only numbers
  // if we pass it undefined too it will mess up the graph
  // so we use the defined() function to neglect all the undefined data points
  // they will leave a blank spot on the graph rather tham crashing
  const strPath = line<TimeSeriesDataPoint>()
    .defined((d) => xFunc(d.x) !== undefined && yFunc(d.y) !== undefined)
    .x((d) => xFunc(d.x) as number)
    .y((d) => yFunc(d.y) as number)
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

function GetYForX_TimeSeries(
  xPos: number,
  pathConfig: TimeSeriesPathResult,
): YForXResult | undefined {
  const { xFunc, yFunc, xRangeMin, xRangeMax, data } = pathConfig;

  // keep x within bounds by clamping it
  let clampedXPos = Math.max(xRangeMin, Math.min(xRangeMax, xPos));
  let res = binarySearch_TimeSeries(clampedXPos, xFunc, data, yFunc);

  return res;
}

// main idea: since scale is not linear
// we find two nearest data points to clicked pixel coordinate using binary search
const binarySearch_TimeSeries = (
  clampedXPos: number,
  xFunc: ReturnType<typeof scaleTime>,
  data: TimeSeriesDataPoint[],
  yFunc: ReturnType<typeof scaleLinear>,
): YForXResult | undefined => {
  // invert takes in a number and returns the datetime
  let inverted = xFunc.invert(clampedXPos);
  if (inverted === undefined) return undefined;
  let timestamp = inverted.getTime(); // returns milliseconds date

  // edge case:1
  // timestamp less than first value in data
  // happens when click was left of starting point of graph
  if (timestamp <= data[0].x) {
    const p = data[0].y;
    const yCoord = yFunc(p);
    const xCoord = xFunc(data[0].x);
    return yCoord === undefined || xCoord === undefined
      ? undefined
      : { yCoord, actualVal: p, index: 0, xCoord };
  }
  // edge case:2
  // click was to right of graph, beyond the last point
  if (timestamp >= data[data.length - 1].x) {
    const lastIdx = data.length - 1;
    const p = data[lastIdx].y;
    const yCoord = yFunc(p);
    const xCoord = xFunc(data[lastIdx].x);
    return yCoord === undefined || xCoord === undefined
      ? undefined
      : { yCoord, actualVal: p, index: lastIdx, xCoord };
  }

  // Binary search for the two timestamps that straddle our target
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

  const leftIdx = left;
  const rightIdx = left + 1;

  // get actual data points from data array
  const leftPoint = data[leftIdx];
  const rightPoint = data[rightIdx];

  // nearest point — pick whichever timestamp is closer
  const distToLeft = timestamp - leftPoint.x;
  const distToRight = rightPoint.x - timestamp;
  const nearestIdx = distToLeft <= distToRight ? leftIdx : rightIdx;
  const nearestPoint = data[nearestIdx];

  const yCoord = yFunc(nearestPoint.y);
  const xCoord = xFunc(nearestPoint.x);

  return yCoord === undefined || xCoord === undefined
    ? undefined
    : { yCoord, actualVal: nearestPoint.y, index: nearestIdx, xCoord };
};
// Find the domain (min and max values) from candlestick data
const FindDomain = (data: Candle[]): [number, number] => {
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

  // our scale function (in math/scale/point) returns number or undefined
  // undefined is returned for NaNs, or undefined or null datums
  // but the "line" function from d3 accepts only numbers
  // if we pass it undefined too it will mess up the graph
  // so we use the defined() function to neglect all the undefined data points
  // they will leave a blank spot on the graph rather tham crashing
  const strPath = line<LineDataPoint>()
    .defined((d) => xFunc(d.x) !== undefined && yFunc(d.y) !== undefined)
    .x((d) => xFunc(d.x) as number)
    .y((d) => yFunc(d.y) as number)
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

function GetYForX(
  xPos: number,
  pathConfig: LineChartPathResult,
): YForXResult | undefined {
  const { xFunc, yFunc, xRangeMin, xRangeMax, step, data } = pathConfig;
  const clamped = Math.max(xRangeMin, Math.min(xRangeMax, xPos));

  return linechartLookup(clamped, data, yFunc, xRangeMin, step);
}

function linechartLookup(
  clampedXPos: number,
  data: LineDataPoint[],
  yFunc: ReturnType<typeof scaleLinear>,
  xRangeMin: number,
  step: number,
): YForXResult | undefined {
  if (step === 0) {
    const p = data[0]?.y ?? 0;
    const yCoord = yFunc(p);
    return yCoord === undefined
      ? undefined
      : { yCoord, actualVal: p, index: 0, xCoord: xRangeMin };
  }

  // scalePoint is evenly spaced so index = round((x - range_min) / step) — O(1), no loop
  // clamped_x is user's finger position on x axis
  // so we calculate distance fdrom left most edge to current position (clamped-x_range_min)
  // thne divide by width of a singel data point
  // immediately returns us current data index where finger is
  const rawIndex = (clampedXPos - xRangeMin) / step;

  // just round off to find closest point
  const nearestIndex = Math.max(
    0,
    Math.min(Math.round(rawIndex), data.length - 1),
  );

  // actual point from data
  const point = data[nearestIndex];
  // y coordinate of touch
  const yCoord = yFunc(point.y);

  // x coordinate of touch will be starting point of x axis (xRangeMin)
  // added with (width of one point * the actual index of point)
  // thus the calcualtion becomes : starting point + the distance of touch
  const xCoord = xRangeMin + nearestIndex * step;

  return yCoord === undefined
    ? undefined
    : { yCoord, actualVal: point.y, index: nearestIndex, xCoord };
}

export {
  GenerateStringPath_TimeSeries,
  GetYForX_TimeSeries,
  FindDomain,
  GenerateStringPath,
  GetYForX,
};
