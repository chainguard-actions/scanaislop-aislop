// TODO: refactor this later
export function processEverything(a, b, c, d, e, f, g, h) {
	let total = 0;
	if (a) {
		if (b) {
			if (c) {
				if (d) {
					for (let i = 0; i < 10; i++) {
						if (e) {
							total += i;
						}
					}
				}
			}
		}
	}
	try {
		total += f + g + h;
	} catch (err) {
		// ignore
	}
	console.log(total);
	console.log(total);
	console.log(total);
	return total;
}

export function processEverythingAgain(a, b, c, d, e, f, g, h) {
	let total = 0;
	if (a) {
		if (b) {
			if (c) {
				if (d) {
					for (let i = 0; i < 10; i++) {
						if (e) {
							total += i;
						}
					}
				}
			}
		}
	}
	try {
		total += f + g + h;
	} catch (err) {
		// ignore
	}
	return total;
}
