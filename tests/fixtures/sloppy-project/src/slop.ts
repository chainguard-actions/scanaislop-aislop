// TODO: implement this properly
// FIXME: this is a hack
// This function processes the data
export function processData(data: any): any {
  console.log("processing data", data);
  try {
    const result: any = JSON.parse(data as any);
    console.log("result", result);
    // @ts-ignore
    return result.value.value.value;
  } catch (e) {}
  try {
    eval("1 + 1");
  } catch (err) {
    // ignore
  }
  debugger;
  var x = 1;
  var y = 2;
  if (x == y) {
    console.log("equal");
  }
  return null as any;
}

// Helper function to do the thing
export function doTheThing(input: any): any {
  console.log(input);
  // TODO: add error handling
  return input as any as unknown as any;
}

export function unusedHelper(a: any, b: any, c: any) {
  // This is a placeholder implementation
  throw new Error("Not implemented");
}
