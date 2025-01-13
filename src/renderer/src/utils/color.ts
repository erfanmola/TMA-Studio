export type HEXColor = `#${string}`;

export const isHexColor = (color: string): boolean => {
	const hexColorRegex =
		/^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{4}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/;
	return hexColorRegex.test(color);
};

export const isColorDark = (colorInput: string) => {
	let color: any = colorInput;
	let r: number;
	let g: number;
	let b: number;

	// Check the format of the color, HEX or RGB?
	if (color.match(/^rgb/)) {
		// If HEX --> store the red, green, blue values in separate variables
		color = color.match(
			/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)$/,
		);

		r = color[1];
		g = color[2];
		b = color[3];
	} else {
		// If RGB --> Convert it to HEX: http://gist.github.com/983661
		color = +`0x${color.slice(1).replace(color.length < 5 && /./g, "$&$&")}`;

		r = color >> 16;
		g = (color >> 8) & 255;
		b = color & 255;
	}

	// HSP equation from http://alienryderflex.com/hsp.html
	const hsp = Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));

	// Using the HSP value, determine whether the color is light or dark
	return hsp <= 127.5;
};
