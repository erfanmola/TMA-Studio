import type { TelegramPlatform } from "@renderer/utils/themes";
import { type Component, Show } from "solid-js";

export const BottomBar: Component<{ platform: TelegramPlatform }> = (props) => {
	return (
		<Show when={false}>
			<div id="section-telegram-bottombar">Bottom Bar in {props.platform}</div>
		</Show>
	);
};
