import "../scss/sections/_menu-more.scss";

import { Show, type Component, type Signal } from "solid-js";
import type { TelegramPlatform, ThemeMode } from "@renderer/utils/themes";

import { CgMoreO } from "solid-icons/cg";
import { IoReload } from "solid-icons/io";
import { FiSettings } from "solid-icons/fi";
import { Dynamic } from "solid-js/web";

export const MenuMore: Component<{
	signalOpen: Signal<boolean>;
	signalSettingsButtonEnabled: Signal<boolean>;
	signalSettingsButtonClicked: Signal<boolean>;
	signalReloadButtonClicked: Signal<boolean>;
	platform: TelegramPlatform;
	mode: ThemeMode;
}> = (props) => {
	const [openMore, setOpenMore] = props.signalOpen;
	const [settingsButtonEnabled] = props.signalSettingsButtonEnabled;
	const [, setSettingsButtonClicked] = props.signalSettingsButtonClicked;
	const [, setReloadButtonClicked] = props.signalReloadButtonClicked;

	const onClickButtonReload = () => {
		setOpenMore(false);
		setReloadButtonClicked(true);
	};

	const onClickButtonSettings = () => {
		setOpenMore(false);
		setSettingsButtonClicked(true);
	};

	return (
		<div id="section-button-more" class={`${props.platform} ${props.mode}`}>
			<Dynamic component={CgMoreO} onClick={() => setOpenMore(!openMore())} />

			<div classList={{ active: openMore() }}>
				<ul>
					<Show when={settingsButtonEnabled()}>
						<li onClick={onClickButtonSettings} onKeyUp={onClickButtonSettings}>
							<FiSettings />
							<span>Settings</span>
						</li>
					</Show>

					<li onClick={onClickButtonReload} onKeyUp={onClickButtonReload}>
						<IoReload />
						<span>Reload</span>
					</li>
				</ul>
			</div>
		</div>
	);
};
