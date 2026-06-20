import { scaleBand } from "./band";

/**
 * Spreads labels evenly along the axis as single points instead of bars.
 *
 * Built on top of scaleBand with `paddingInner` locked to 1 — this forces
 * `bandwidth` to always be 0 (step * (1 - 1) = 0), so each label maps to
 * a single x position instead of a band with width.
 *
 * Use this for line/scatter chart x-axes where you want each category
 * centered at a point, not occupying a rect.
 */
export function scalePoint<T extends string | number>() {
  const band = scaleBand<T>();
  // lock paddingInner permanently — point scales never expose this,
  // it's an implementation detail of "what makes a band a point"
  band.paddingInner(1);

  /**
   * @param category a value from the domain
   * @returns the point's pixel position, or undefined if category isn't in domain
   */
  function scale(category: T): number | undefined {
    return band(category);
  }

  /**
   * @returns the spacing between consecutive points
   * (equivalent to band's step, since bandwidth is always 0 here)
   */
  scale.step = function () {
    return band.step();
  };

  /**
   * @param d optional array of categories
   * @returns current domain if `d` is undefined
   * @returns new scale factory if `d` was provided
   */
  scale.domain = function (d?: T[]) {
    return d === undefined ? band.domain() : band.domain(d);
  };

  /**
   * @param r optional [min, max] pixel range
   * @returns current range if `r` is undefined
   * @returns new scale factory if `r` was provided
   */
  scale.range = function (r?: [number, number]) {
    return r === undefined ? band.range() : band.range(r);
  };

  /**
   * @param r optional boolean
   * @returns current round config if `r` is undefined
   * @returns new scale factory if `r` was provided
   *
   * `round = true` snaps point positions to whole pixels
   */
  scale.round = function (r?: boolean) {
    return r === undefined ? band.round() : band.round(r);
  };

  /**
   * @param p optional number, fraction of step reserved before the first
   * point and after the last point
   * @returns current padding if `p` is undefined
   * @returns new scale factory if `p` was provided
   *
   * Exposed as just "padding" (not paddingInner/paddingOuter) because
   * paddingInner is locked at 1 internally and never meant to be touched —
   * this maps directly to band's paddingOuter.
   */
  scale.padding = function (p?: number) {
    return p === undefined ? band.paddingOuter() : band.paddingOuter(p);
  };

  /**
   * @param a optional number, clamped to [0, 1]
   * @returns current align if `a` is undefined
   * @returns new scale factory if `a` was provided
   *
   * controls where leftover space goes: 0 = pushed right, 1 = pushed left,
   * 0.5 = centered (default)
   */
  scale.align = function (a?: number) {
    return a === undefined ? band.align() : band.align(a);
  };

  return scale;
}