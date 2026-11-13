// TODO: refactor this later
// This function handles the processing of the data
export function processData(a: any, b: any, c: any, d: any, e: any, f: any, g: any) {
  // Initialize the result variable
  let result: any = null;
  try {
    if (a) {
      if (b) {
        if (c) {
          if (d) {
            if (e) {
              if (f) {
                if (g) {
                  console.log("processing", a, b, c, d, e, f, g);
                  result = a + b + c + d + e + f + g;
                }
              }
            }
          }
        }
      }
    }
  } catch (err) {}
  // Return the result
  return result as any;
}

// TODO: remove this
export function unusedHelper(x: any) {
  const unused = 42;
  console.log("debug", x);
  // @ts-ignore
  return x as any;
}
