// Any scale function goes like this :
// take the input domain -> convert(normalise) t [0, 1] range -> convert again (interpolate) to the given range
// a transformation can happen before normalise, for example for linear its identity (inp=x => out=x), for log its (inp=x, out=Math.log(x))
// TODO : add runtime safety for data types (use a=+a and Number())

/**
 * 
 * @param x number 
 * @returns number
 * Returns same value as the given number
 */
export function identity(x: number) {
  return x;
}

/** 
  Accepts a range of numbers.
  Returns a function :
  returned function takes a number and converts it into [0, 1] range based on passed domain
*/
export function normalise(a: number, b: number) {
  // check if b-a is 0, we handle it differently (like normalise (5, 5))
  // we reassign b = b-a, then check for condition
  return (b -= a)
    ? function (x: number) {
        return (x - a) / b;
      }
    : function () {
        return 0.5;
      };
}

/**
 * Clamps any value outside the given range.
 * Returns a function.
 */
export function clamper(a: number, b: number) {
  if (a > b) {
    // if values were provided in reverse order (e.g. [100, 0]), just swap them
    [a, b] = [b, a];
  }
  return function (x: number) {
    return Math.max(a, Math.min(b, x));
  };
}

/**
 * Interpolation function.
 */
export function interpolate(a: number, b: number) {
  return function (t: number) {
    return a * (1 - t) + b * t;
  };
}
/**
 * Normalize(a, b)(x) takes a domain value x in [a,b] and returns the corresponding parameter t in [0,1].
 * Interpolate(a, b)(t) takes a parameter t in [0,1] and returns the corresponding range value x in [a,b].
 *
 * We combine these two steps here.
 */
export function bimap(domain: [number, number], range: [number, number]) {
  // extract the domain and range value
  const [d0, d1] = domain;
  const [r0, r1] = range;

  // get back the normaliser func by calling normalise()
  // also check if the domains were given in reverse order e.g. [100, 0], if so reverse them to get correct order
  const normaliserFunc = d0 > d1 ? normalise(d1, d0) : normalise(d0, d1);
  const interpolatorFunc = d0 > d1 ? interpolate(r1, r0) : interpolate(r0, r1);

  return function (x: number) {
    return interpolatorFunc(normaliserFunc(x));
  };
}
