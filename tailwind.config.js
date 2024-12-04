/** @type {import('tailwindcss').Config} */
module.exports = {
	content: [
		"./src/renderer/index.html",
		"./src/renderer/floating.html",
		"./src/renderer/src/**/*.{js,jsx,ts,tsx}",
	],
	theme: {
		extend: {},
	},
	plugins: [],
};
