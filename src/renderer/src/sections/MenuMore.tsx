import "../scss/sections/_menu-more.scss";

import { Match, Show, Switch, type Component } from "solid-js";

import { CgMoreO } from "solid-icons/cg";
import { IoReload } from "solid-icons/io";
import { FiMoreVertical, FiSettings } from "solid-icons/fi";
import type { TMAProjectFrame } from "@renderer/pages/Project";
import type { SetStoreFunction } from "solid-js/store";
import type { TMAProjectInner } from "@renderer/utils/telegram";

export type MenuMoreStore = {
	open: boolean;
	settings: {
		clicked: boolean;
	};
	reload: {
		clicked: boolean;
	};
	closeOrBack: {
		clicked: boolean;
	};
};

export const MenuMore: Component<{
	projectFrameStore: [TMAProjectFrame, SetStoreFunction<TMAProjectFrame>];
	projectInnerStore: [TMAProjectInner, SetStoreFunction<TMAProjectInner>];
	menuMoreStore: [MenuMoreStore, SetStoreFunction<MenuMoreStore>];
}> = (props) => {
	const [projectFrame] = props.projectFrameStore;
	const [projectInner] = props.projectInnerStore;

	const [menuMore, setMenuMore] = props.menuMoreStore;

	const onClickButtonReload = () => {
		setMenuMore({
			open: false,
			reload: {
				clicked: true,
			},
		});
	};

	const onClickButtonSettings = () => {
		setMenuMore({
			open: false,
			settings: {
				clicked: true,
			},
		});
	};

	return (
		<div
			id="section-button-more"
			class={`${projectFrame.platform} ${projectFrame.state.mode}`}
		>
			<Switch>
				<Match when={projectFrame.platform === "ios"}>
					<CgMoreO onClick={() => setMenuMore("open", !menuMore.open)} />
				</Match>

				<Match when={projectFrame.platform === "android"}>
					<FiMoreVertical onClick={() => setMenuMore("open", !menuMore.open)} />
				</Match>
			</Switch>

			<div classList={{ active: menuMore.open }}>
				<ul>
					<Show when={projectInner.settingsButton.enabled}>
						<li onClick={onClickButtonSettings}>
							<FiSettings />
							<span>Settings</span>
						</li>
					</Show>

					<li onClick={onClickButtonReload}>
						<IoReload />
						<span>Reload</span>
					</li>
				</ul>
			</div>
		</div>
	);
};
