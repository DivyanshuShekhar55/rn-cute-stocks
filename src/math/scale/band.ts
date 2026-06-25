// Return type of the Scale Band Function
interface ScaleBand<T extends string | number> {
  (category: T): number | undefined;
  bandwidth(): number;
  step(): number;
  domain(): [number, number]; // getter
  domain(d: T[]): ScaleBand<T>;
  range(): [number, number];
  range(r: [number, number]): ScaleBand<T>;
  round(): boolean;
  round(r: boolean): ScaleBand<T>;
  paddingInner(): number;
  paddingInner(p: number): ScaleBand<T>;
  paddingOuter(): number;
  paddingOuter(p: number): ScaleBand<T>;
  align(): number;
  align(a: number): ScaleBand<T>;
}

/**
 * Takes in label as param (type number or string) and spreads them evenly along the axes.
 */
export function scaleBand<T extends string | number>(): ScaleBand<T> {
  // as with scaleLinear and scaleTime scaleBand will NOT be [number, number]
  // can have any length of labels
  let domain: T[] = [];
  let range: [number, number] = [0, 1];

  // padding inner is the space between bars, goes from 0-1
  // it is a percentage of bar's width to be used padding
  // example - padding = 0.2 means 20% of step size to be used for padding
  let paddingInner = 0;

  // padding outer is the space before the forst bar and the axis and the padding after the last bar
  // same maths as innerPadding
  let paddingOuter = 0;

  // align specifies where the extra space is to be used
  // 0 would push all the extra space to right, 1 to left
  // 0.5 aligns in center
  let align = 0.5;

  // round would put bars at crisp pixels and not some decimal points
  let round = false;

  // step is the actual width a bar gets (along with its padding)
  // roughly totalWidth/numOfBars
  let step = 0;

  // bandwidth is what the actual dev will use
  // bandwidth = step * (1-padding)
  let bandwidth = 0;

  // store label to start position as KV pairs
  let positions: Map<T, number> = new Map();

  function rescale() : ScaleBand<T> {
    const n = domain.length;

    const reverse = range[1] < range[0];
    const start0 = reverse ? range[1] : range[0];
    const stop0 = reverse ? range[0] : range[1];

    // apply paddingOuter twice - one before start, one after end bar
    step = (stop0 - start0) / Math.max(1, n - paddingInner + paddingOuter * 2);
    if (round) step = Math.floor(step);

    const totalAvailableWidth = stop0 - start0;
    // step = barWidth + its padding
    // so n*steps gives n*padding + n*barArea
    // subtract size of one padding (since for n bars we need only n-1 padding) = step*paddingInner
    const totalUsedWidth = n * step - step * paddingInner;

    // leftover space — the gap between "total width" and "width actually used." This is positive slack that needs to go somewhere
    const extraSpaceLeft = totalAvailableWidth - totalUsedWidth;

    // align the extra space with align prop and add the start point
    // example - if align = 0, then start would just be start0 (all extra space to right)
    let start = start0 + extraSpaceLeft * align;

    // example -  if padding = 0.3, then real bar width = step * 0.7
    bandwidth = step * (1 - paddingInner);

    if (round) {
      start = Math.round(start);
      bandwidth = Math.round(bandwidth);
    }

    // store the starting pos. for all bars
    const values = domain.map((_, i) => start + step * i);
    if (reverse) values.reverse();

    // store domain label to start pos.
    positions = new Map(domain.map((d, i) => [d, values[i]]));

    return scale;
  }

  // unlike linear or time scale, we do not have a cached "output" function here
  // we directly check the positions map, if found the requested label, return their starting position
  /**
   *
   * @param category
   * @returns The starting position for the category
   */
  const scale = function (category: T): number | undefined {
    return positions.get(category);
  } as ScaleBand<T>;

  /**
   * @returns {number} returns the width occupied by the bars
   */
  scale.bandwidth = function (): number {
    return bandwidth;
  };

  /**
   * @returns Returns the step size for bars.
   * Step size is the sum of width of bar and it's inner padding
   */
  scale.step = function () {
    return step;
  };

  /**
   *
   * @param d optional array of categories
   * @returns if no `d` was provided, it acts as a getter method. Returns the current values in domain.
   * @returns new scale factory, if `d` was provided
   */
  scale.domain = function (d?: T[]) {
    if (d === undefined) return domain.slice();
    domain = d.slice();
    // invalidate the cache and re-run calculations
    return rescale();
  } as ScaleBand<T>["domain"];

  /**
   *
   * @param r optional list of numbers as new range
   * @returns the original range if no `r` was provided
   * @returns new scale factory, if `r` was provided
   */
  scale.range = function (r?: [number, number]) {
    if (r === undefined) return range.slice() as [number, number];
    range = [Number(r[0]), Number(r[1])];
    return rescale();
  } as ScaleBand<T>["range"];

  /**
   *
   * @param r optional boolean
   * @returns the current config for round variable, if `r` is undefined
   * @returns new scale factory if `r` was provided
   *
   * `r = true` would set the start position of categories as well as the bandwidth to rounded nearest integers
   */
  scale.round = function (r?: boolean) {
    if (r === undefined) return round;

    // convert the param into a bool (if user passes in string or integers )
    // example - "true" or 1 would be converted back to true
    round = !!r;
    return rescale();
  } as ScaleBand<T>["round"];

  /**
   *
   * @param p optional number. `0 <= p <= 1`
   * @returns current paddingInner value if `p` is undefined
   * @returns new scale factory otherwise.
   *
   * paddingInner` represents fraction of the step size to be used as padding between consecutive domain values
   */
  scale.paddingInner = function (p?: number) {
    if (p === undefined) return paddingInner;
    paddingInner = Math.min(1, p);
    return rescale();
  } as ScaleBand<T>["paddingInner"];

  /**
   * @param p optional number — fraction of `step` to reserve as space
   * before the first bar and after the last bar
   * @returns current `paddingOuter` if `p` is undefined
   * @returns new scale factory if `p` was provided
   */
  scale.paddingOuter = function (p?: number) {
    if (p === undefined) return paddingOuter;
    paddingOuter = Number(p);
    return rescale();
  } as ScaleBand<T>["paddingOuter"];

  /**
   * @param a optional number, clamped to `[0, 1]`
   * @returns current `align` if `a` is undefined
   * @returns new scale factory if `a` was provided
   *
   * controls where leftover (unused) space goes after laying out bars:
   * 0 = all extra space pushed right, 1 = pushed left, 0.5 = centered
   */
  scale.align = function (a?: number) {
    if (a === undefined) return align;
    align = Math.max(0, Math.min(1, a));
    return rescale();
  } as ScaleBand<T>["align"];

  return scale;
}
