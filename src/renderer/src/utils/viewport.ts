import type { TelegramPlatform } from "./themes";

export const Viewport: {
	[key in TelegramPlatform]: {
		name: string;
		size: number;
	}[];
} = {
	android: [
		{ name: "Samsung Galaxy S23 Ultra", size: 412 },
		{ name: "Samsung Galaxy S8+", size: 360 },
		{ name: "Xiaomi 12", size: 390 },
		{ name: "Samsung Galaxy A54", size: 411 },
		{ name: "Xiaomi Redmi Note 12", size: 393 },
	],
	ios: [
		{ name: "iPhone SE", size: 375 },
		{ name: "iPhone XR", size: 414 },
		{ name: "iPhone 16", size: 390 },
		{ name: "iPhone 16 Plus", size: 428 },
		{ name: "iPhone 16 Pro Max", size: 430 },
	],
	tdesktop: [
		{ name: "Default", size: 384 },
		{ name: "Zoom 125%", size: 480 },
	],
	web: [
		{ name: "Default", size: 480 }, // 480x640
	],
	weba: [
		{ name: "Default", size: 420 }, // 420x690
	],
	macos: [
		{ name: "Default", size: 400 }, // 400x644
	],
};
