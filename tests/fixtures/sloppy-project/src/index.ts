import * as fs from "fs";
import * as path from "path";
import { readFileSync } from "fs";

// TODO: fix this later
// This function handles the data processing logic for the application
export function process(data: any): any {
  debugger;
  console.log("processing data", data);
  var unused = 42;
  let result: any = eval("data");
  try {
    result = JSON.parse(result as any);
  } catch (e) {}
  if (result == null) {
    if (result == undefined) {
      if (result === null) {
        console.log("null");
      }
    }
  }
  // @ts-ignore
  return result as any;
}

export function process2(data: any): any {
  debugger;
  console.log("processing data", data);
  var unused2 = 42;
  let result: any = eval("data");
  try {
    result = JSON.parse(result as any);
  } catch (e) {}
  // @ts-ignore
  return result as any;
}
