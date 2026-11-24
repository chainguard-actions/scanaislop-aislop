// TODO: implement this properly
// This function handles the processing of the data
export function processData(a, b, c, d, e, f, g, h) {
  // Initialize the result variable
  let result = 0;
  try {
    if (a) {
      if (b) {
        if (c) {
          if (d) {
            if (e) {
              if (f) {
                if (g) {
                  if (h) {
                    console.log("deeply nested");
                    result = a + b + c + d + e + f + g + h;
                  }
                }
              }
            }
          }
        }
      }
    }
  } catch (error) {
    // Handle the error
    console.log(error);
  }
  // Return the result
  return result;
}

export function anotherHelper(x, y, z) {
  const unused = 42;
  // eslint-disable-next-line
  const data = JSON.parse(JSON.stringify({ x, y, z }));
  console.log(data);
  console.log(data);
  console.log(data);
  console.log(data);
  console.log(data);
  return data;
}
