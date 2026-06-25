import { bimap, clamper, identity } from "./continuous";

interface ScaleTime {
  (x: Date | number): number | undefined;
  invert(y: number): Date | undefined;
  domain(): [Date, Date]; // getter
  domain(d: [Date | number, Date | number]): ScaleTime; // setter
  range(): [number, number]; // getter
  range(r: [number, number]): ScaleTime; // setter
  clamp(): boolean; // getter
  clamp(c: boolean): ScaleTime; // setter
}

/**
 * This inputs time as domain and uses a linear scale to spread the data.
 *
 * Converts date strings into ms integer, then proceed same as scaleLinear
 */
export function scaleTime(): ScaleTime {
  // introduce default domain and range
  let domain: [Date, Date] = [new Date(0), new Date()];
  let range: [number, number] = [0, 1];
  // clamp dates too?
  let clampFunc: (x: number) => number = identity;

  // cached output function that takes in a ms time (inside domain)
  // outputs a number based on range
  let output: ((x: number) => number) | null = null;
  // cached input function : takes in a number from range
  // returns the corresponding ms based number from the domain
  let input: ((x: number) => number) | null = null;

  // coerce date into number (ms)
  // if already a number, +d is a no-op
  function toMs(d: Date | number | undefined | null): number | undefined {
    // do a loose check, if null or undefined, return undefined
    if (d == null) return undefined;

    const ms = +d;
    return isNaN(ms) ? undefined : ms;
  }

  function rescale() : ScaleTime {
    output = null;
    input = null;
    return scale;
  }

  const scale = function (date: Date | number): number | undefined {
    const ms = toMs(date);
    if (ms === undefined) return undefined;

    // check if output function was cached, if so use it
    // else build the new ouput function
    if (!output) {
      const d0 = toMs(domain[0]);
      const d1 = toMs(domain[1]);

      if (d0 === undefined || d1 === undefined) return undefined;
      // this "builds" the output function
      output = bimap([d0, d1], range);
    }
    // this calls the output function
    // also clamp the time ms within the accepted domain before calling
    return output(clampFunc(ms));
  } as ScaleTime;

  scale.invert = function (y: number): Date | undefined {
    // check if input function is cached
    if (!input) {
      const d0 = toMs(domain[0]);
      const d1 = toMs(domain[1]);
      if (d0 === undefined || d1 === undefined) return undefined;

      const domainMs: [number, number] = [d0, d1];
      // build the input function
      // just reverse : map from range to domain
      input = bimap(range, domainMs);
    }
    // call the input function
    // clamp the input
    const ms = clampFunc(input(y));
    // if input y was NaN or undefined, etc
    if (ms == null || isNaN(ms)) return undefined;

    return new Date(ms);
  } as ScaleTime["invert"];

  scale.domain = function (d?: [Date | number, Date | number]) {
    // if no domain given, then function acts as a getter
    // runtime check the domain dates and send it back
    if (d === undefined) return [new Date(domain[0]), new Date(domain[1])];

    // if provided its a setter, construct new domain
    // also rescale, to invalidate cache
    domain = [new Date(d[0]), new Date(d[1])];
    return rescale();
  } as ScaleTime["domain"];

  scale.range = function (r?: [number, number]) {
    // return a shallow copy of range (safer, no operation can happen on that returned range)
    if (r === undefined) return range.slice();
    range = [Number(r[0]), Number(r[1])];
    return rescale();
  } as ScaleTime["range"];

  // we don't use toMs() here because it can return undefined
  // usual flow goes like scale.clamp().domain()...
  // domain() and other such functions anyway handle undefined
  // but returning undefined from clamp can fail
  scale.clamp = function (c?: boolean) {
    if (c === undefined) return clampFunc !== identity;
    clampFunc = c ? clamper(+domain[0], +domain[1]) : identity;
    return rescale();
  } as ScaleTime["clamp"];

  return scale;
}
