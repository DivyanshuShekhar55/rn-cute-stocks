import { bimap, clamper, identity } from "./continuous";

// TS had issues referencing the type of ScaleLinear and its functions so we need to explicitly tell it
// Also need to separate out the getter and setter from those functions which allows both (like domain, range and clamp here)
// TS doesn't know what will be return type if we define both getter and setter as one function (which we do define as one function only)
// e.g.,  domain(d?: [number, number]): [number, number] | LinearScale, but TS can't guess if its a getter it returns [number, number] and LinearScale for setters. It thinks even a getter can return both types
// but in implementation it will still be one function, just need to split in the interface
// rescale is internal function and hence doesn't belong to LinearScale interface / return type

interface LinearScale {
  (x: number): number | undefined;
  invert(y: number): number;
  domain(): [number, number]; // getter
  domain(d: [number, number]): LinearScale; // setter
  range(): [number, number]; // getter
  range(r: [number, number]): LinearScale; // setter
  clamp(): boolean; // getter
  clamp(c: boolean): LinearScale; // setter
}

/**
 * Scale Linear function returns a function which is based on a linear scale.
 */
export function scaleLinear(): LinearScale {
  // this function is a closure because we want to cache things

  // we assume domain and range as [0, 1] by default
  // will overwrite if user provides it
  let domain: [number, number] = [0, 1];
  let range: [number, number] = [0, 1];
  // no clamping by default
  let clampFunc = identity;

  // cached function for forward direction (i.e., doamin -> range)
  // given a value in domain, return a corresponding value in range
  let output: ((x: number) => number) | null = null;
  // reverse direction cache
  // given a point in range, return the corresponding point from domain
  let input: ((x: number) => number) | null = null;

  function rescale(): LinearScale {
    // if config changed, invalidate the cahched input and output
    output = null;
    input = null;
    if (clampFunc !== identity) {
      clampFunc = clamper(domain[0], domain[domain.length - 1]);
    }
    return scale;
  }

  const scale = function (x: number): number | undefined {
    if (x == null || isNaN(x)) return undefined;

    // create & cache output, if not present
    // this "builds" the output function
    if (!output) output = bimap(domain, range);

    // this calls the output function
    // clamp x, then return the corresponding value belonging in the range
    return output(clampFunc(x));
  } as LinearScale;

  // takes a number from range, returns correspodning domain value
  // also clamp the return from input function
  scale.invert = function (y: number) {
    if (!input) input = bimap(range, domain);
    return clampFunc(input(y));
  };

  // getter and setter
  scale.domain = function (d?: [number, number]) {
    // if no arguments were given, just return domain
    // return a shallow copy, so users don't accidently modify it
    if (d === undefined) return domain.slice() as [number, number];

    // if a new domain was given, update the domain
    // Number() is a safety net, as the end user will insert the data (it's runtime and TS is not applicable)
    // that data might come in form of strings for example
    domain = [Number(d[0]), Number(d[1])];

    // inavalidate cache
    return rescale();
  } as LinearScale["domain"];

  // getter and setter, same pattern as domain
  scale.range = function (r?: [number, number]) {
    if (r === undefined) return range.slice() as [number, number];

    // Number() here too — range values could also come in as strings
    // from untyped/runtime call sites
    range = [Number(r[0]), Number(r[1])];

    return rescale();
  } as LinearScale["range"];

  // getter and setter for clamping
  // clamp = true means values outside domain get pinned to domain edges
  // before being passed through the scale, instead of extrapolating
  scale.clamp = function (c?: boolean) {
    if (c === undefined) return clampFunc !== identity;

    clampFunc = c ? clamper(domain[0], domain[1]) : identity;
    return rescale();
  } as LinearScale["clamp"];

  // without this, scaleLinear() returns undefined and nothing works
  return scale;
}
