import "./KeyboardCombo.scss";

import { FiCommand } from "solid-icons/fi";
import { Show, type Component } from "solid-js";
import { platform } from "@tauri-apps/plugin-os";

const KeyboardCombo: Component<{ includeSuper?: boolean; key: string }> = (
	props,
) => {
	return (
		<span class="kbd">
			<Show when={props.includeSuper}>
				{platform() === "macos" ? <FiCommand /> : "Ctrl"} {"+"}
			</Show>
			<b>{props.key}</b>
		</span>
	);
};

export default KeyboardCombo;
