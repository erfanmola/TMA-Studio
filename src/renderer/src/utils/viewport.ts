import type { TelegramPlatform } from "./themes";

export const Viewport: {
	[key in TelegramPlatform]: {
		name: string;
		width: number;
		height: number;
	}[];
} = {
	android: [
		{ name: "Samsung Galaxy S23 Ultra", width: 412, height: 915 },
		{ name: "Samsung Galaxy S8+", width: 360, height: 740 },
		{ name: "Xiaomi 12", width: 390, height: 844 },
		{ name: "Samsung Galaxy A54", width: 411, height: 915 },
		{ name: "Xiaomi Redmi Note 12", width: 393, height: 873 },
	],
	ios: [
		{ name: "iPhone SE", width: 375, height: 667 },
		{ name: "iPhone XR", width: 414, height: 896 },
		{ name: "iPhone 16", width: 390, height: 844 },
		{ name: "iPhone 16 Plus", width: 428, height: 926 },
		{ name: "iPhone 16 Pro Max", width: 430, height: 932 },
	],
	tdesktop: [
		{ name: "Default", width: 384, height: 640 },
		{ name: "Zoom 125%", width: 480, height: 800 },
	],
	web: [{ name: "Default", width: 480, height: 640 }],
	weba: [{ name: "Default", width: 420, height: 690 }],
	macos: [{ name: "Default", width: 400, height: 644 }],
};
