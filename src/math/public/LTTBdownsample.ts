// math/publc/downsamplerLTTB.ts

// exported mainly for dpwnsampling linechart and timeseries chart
// however remember once downsampled the on-tap callback will return the data point and index
// as per the new downsampled data and NOT the original one

/**
 * Largest Triangle Three Buckets (LTTB) downsampling.
 * Reduces a series to `targetPoints` while preserving visual shape —
 * peaks and troughs are kept, unlike naive decimation or averaging.
 *
 * Always keeps the first and last point of the original data.
 *
 * @param data array of points, must have numeric `x` (use timestamps
 *             for TimeSeriesChart data, or map string labels to indices
 *             for LineChart data before calling this)
 * @param targetPoints desired output length. If data.length <= targetPoints, returns the original data unchanged.
 */
const downsampleLTTB = <T extends { x: number; y: number }>(
  data: T[],
  targetPoints: number,
) => {
  const n = data.length;

  // nothing to do — already small enough, or degenerate target
  if (targetPoints >= n || targetPoints <= 2) return data;

  const sampled: T[] = [data[0]]; // always keep first point of data

  // bucket size excludes the fixed first/last points
  const bucketSize = (n - 2) / (targetPoints - 2);

  let prevSelectedIndex = 0;

  // run a loop moving through buckets
  for (let i = 0; i < targetPoints - 2; i++) {
    // current bucket range
    // first point = bucketNumber * bucketSize + 1
    // +1 because we always include the first point of data, so bucketing starts from 2nd number
    // example if bucket size=10, and current bucket=2,
    // then start = 21 and end =31
    const bucketStart = Math.floor((i + 0) * bucketSize) + 1;
    const bucketEnd = Math.floor((i + 1) * bucketSize) + 1;
    // make sure calculated last point doesn't jump off the available data
    const bucketEndClamped = Math.min(bucketEnd, n - 1);

    // average point of the NEXT bucket — used as one triangle vertex
    // to decide which point in the current bucket is most "significant"
    const nextBucketStart = bucketEnd;
    const nextBucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n);

    // find average point (i.e, (x, y) coordinate) from next bucket
    let avgX = 0;
    let avgY = 0;
    let avgCount = 0;
    for (let j = nextBucketStart; j < nextBucketEnd; j++) {
      avgX += data[j].x;
      avgY += data[j].y;
      avgCount++;
    }
    if (avgCount > 0) {
      avgX /= avgCount;
      avgY /= avgCount;
    } else {
      // fallback: last point in data if next bucket is empty (edge of series)
      avgX = data[n - 1].x;
      avgY = data[n - 1].y;
    }

    const prevPoint = data[prevSelectedIndex];

    // find point in current bucket forming the largest triangle
    // with prevPoint and the next bucket's average point
    let maxArea = -1;
    let maxAreaIndex = bucketStart;

    for (let j = bucketStart; j < bucketEndClamped; j++) {
      const point = data[j];
      // triangle area via cross product (shoelace), magnitude only —
      // we only care which is bigger, not sign/orientation
      // ya i iknow its 1/2 * base * height, but we can remove 1/2 cause who cares
      const area = Math.abs(
        (prevPoint.x - avgX) * (point.y - prevPoint.y) -
          (prevPoint.x - point.x) * (avgY - prevPoint.y),
      );
      if (area > maxArea) {
        maxArea = area;
        maxAreaIndex = j;
      }
    }

    sampled.push(data[maxAreaIndex]);
    prevSelectedIndex = maxAreaIndex;
  }

  sampled.push(data[n - 1]); // always keep last point

  return sampled;
};

export { downsampleLTTB };
