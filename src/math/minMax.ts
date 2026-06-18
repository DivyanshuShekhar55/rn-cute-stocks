// Find min and max

// Math.min() or Math.max() doesn't handle nulls r NaN types in checking for value
// Also data is not simply an array its and object like data = [{x:_, y:_}]
// we shouldn't copy different values in different arrays, it would be a memory issue like x=[] & y=[].

// So we must provide a way to iterate through the object and grab the min, max fdrom whatever field user describes at runtime or without extra memory space.
// Also handle null, undefined, non-numerical values, NaN in data without crashing

// type signature for the numeric accessor (access a field from object) function
// value is each field item we want to read
// valueof is the function user provides that helps us understand what value to read, like min(data, (d)=> d.x)
// JS doesn't care if you ignore extra params. So (d) => d.value is perfectly valid for (value: T, index: number, values: Iterable<T>) => number — TS allows fewer params than declared.
// The index and values are used in the function only, user doesn't pass them
type NumericAccessorFunction<T> = (
  value: T,
  index: number,
  values: Iterable<T>,
) => number | undefined | null;

/**
 * Returns the maximum number in the given iterable.
 */
export function min<T>(
  values: Iterable<T>,
  valueof?: NumericAccessorFunction<T>,
): number | undefined {
  let min: number | undefined;

  if (valueof === undefined) {
    // no accessor func, data/values should be an array
    for (const value of values) {
      // Cast to any just to bypass TS complaining about comparing unknown T types,
      // but under the hood we expect numbers/null/undefined/NaN.
      // We use a loose check with value != null, which checks for both null and undefined cases
      // then we check if current value is smaller than min
      // or if min is undefined (not yet initialised) and cuurent values is valid (NaN would fail >= check)
      if (
        value != null &&
        typeof value === "number" &&
        (min! > (value as any) ||
          (min === undefined && (value as any) >= (value as any)))
      ) {
        min = value as unknown as number;
      }
    }
  } else {
    // an accessor function is present
    let index = -1;
    for (const item of values) {
      const value = valueof(item, ++index, values);
      if (
        value != null &&
        (min! > value || (min === undefined && value >= value))
      ) {
        min = value;
      }
    }
  }

  return min;
}

/**
 * Returns the maximum number in the given iterable.
 */
export function max<T>(
  values: Iterable<T>,
  valueof?: NumericAccessorFunction<T>,
): number | undefined {
  let max: number | undefined;

  if (valueof === undefined) {
    for (const value of values) {
      if (
        value != null &&
        (max! < (value as any) ||
          (max === undefined && (value as any) >= (value as any)))
      ) {
        max = value as unknown as number;
      }
    }
  } else {
    let index = -1;
    for (const item of values) {
      const value = valueof(item, ++index, values);
      if (
        value != null &&
        (max! < value || (max === undefined && value >= value))
      ) {
        max = value;
      }
    }
  }

  return max;
}
