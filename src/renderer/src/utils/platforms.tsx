import { FaSolidA, FaSolidK } from "solid-icons/fa";

import { FiMonitor } from "solid-icons/fi";
import type { JSX } from "solid-js";
import { RiLogosAndroidLine } from "solid-icons/ri";
import { SiIos } from "solid-icons/si";
import { TbBrandApple } from "solid-icons/tb";
import type { TelegramPlatform } from "./themes";

export const PlatformNames: { [key in TelegramPlatform]: string } = {
	android: "Android",
	ios: "iOS",
	tdesktop: "Desktop",
	web: "K",
	weba: "A",
	macos: "MacOS",
};

export const PlatformIcons: { [key in TelegramPlatform]: () => JSX.Element } = {
	android: () => <RiLogosAndroidLine />,
	ios: () => <SiIos />,
	tdesktop: () => <FiMonitor />,
	web: () => <FaSolidK />,
	weba: () => <FaSolidA />,
	macos: () => <TbBrandApple />,
};
