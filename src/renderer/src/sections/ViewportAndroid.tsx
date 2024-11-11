import type { Component, Signal } from "solid-js";
import type { TelegramPlatform, ThemeMode } from "@renderer/utils/themes";

import { AndroidFrame } from "@renderer/components/DeviceFrames";
import type { Project } from "@renderer/types";

export const ViewportAndroid: Component<{
	project: Project;
	platform: TelegramPlatform;
	signalMode: Signal<ThemeMode>;
	signalExpanded: Signal<boolean>;
	signalInspectElement: Signal<boolean>;
	signalOpen: Signal<boolean>;
}> = (props) => {
	return (
		<AndroidFrame>
			<div>Data: {JSON.stringify(props)}</div>
		</AndroidFrame>
	);
};
