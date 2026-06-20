import { bimap, clamper, identity } from "./continuous";

/**
 * Scale Linear function returns a function which is based on a linear scale.
 */
export function scaleLinear() {
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

  function rescale() {
    // if config changed, invalidate the cahched input and output
    output = null;
    input = null;
    if (clampFunc !== identity) {
      clampFunc = clamper(domain[0], domain[domain.length - 1]);
    }
    return scale;
  }

  function scale(x: number) {
    if (x == null || isNaN(x)) return undefined;

    // create & cache output, if not present
    // this "builds" the output function
    if (!output) output = bimap(domain, range);

    // this calls the output function
    // clamp x, then return the corresponding value belonging in the range
    return output(clampFunc(x));
  }

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
  };
}
