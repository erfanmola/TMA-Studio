import "./FloatingProject.scss";

import { createEffect, Match, Switch, type Component } from "solid-js";
import { useParams } from "@solidjs/router";
import { HeaderWidget } from "@renderer/sections/HeaderWidget";
import { ViewportAndroid } from "@renderer/sections/ViewportAndroid";
import type { TelegramPlatform } from "@renderer/utils/themes";
import type { Project } from "@renderer/types";
import { ViewportIOS } from "@renderer/sections/ViewportIOS";
import { initStore } from "@renderer/utils/store";
import { preferences, setPreferences } from "@renderer/utils/preferences";
import { createStore, produce } from "solid-js/store";
import type { TMAProjectFrame } from "@renderer/pages/Project";
import { generateProjectFrame } from "@renderer/utils/telegram";
import { deserializeObject } from "@renderer/utils/general";
import { useSettings } from "@renderer/contexts/SettingsContext";
import { PlatformNames } from "@renderer/utils/platforms";

const FloatingProject: Component = () => {
	const params = useParams();
	const platform = params.platform as TelegramPlatform;

	const { settings } = useSettings();

	initStore();

	const project = preferences.projects.find(
		(item) => item.id === params.project,
	) as Project;

	const [projectFrame, setProjectFrame] = createStore<TMAProjectFrame>(
		generateProjectFrame(platform, project),
	);

	createEffect(async () => {
		// TODO: handle this in a better place
		setPreferences(
			produce((store) => {
				const projectItem = store.projects.find(
					(item) => item.id === project.id,
				);
				if (projectItem) {
					projectItem.settings[platform].mode = projectFrame.state.mode;
					projectItem.settings[platform].expanded = projectFrame.state.expanded;
					projectItem.settings[platform].open = projectFrame.state.open;
					projectItem.settings[platform].floating =
						projectFrame.window.floating;
				}
			}),
		);
	});

	createEffect(() => {
		settings.set("preferences", deserializeObject(preferences));
	});

	createEffect(() => {
		document.body.classList.remove("light", "dark");
		document.body.classList.add(preferences.theme_mode);
	});

	return (
		<Switch>
			<Match when={platform === "android"}>
				<div id="section-telegram-android">
					<div>
						<HeaderWidget
							project={project}
							platform="android"
							title={`Telegram ${PlatformNames[projectFrame.platform]}`}
							projectFrameStore={[projectFrame, setProjectFrame]}
							placeholder={false}
						/>

						<ViewportAndroid
							project={project}
							projectFrameStore={[projectFrame, setProjectFrame]}
							placeholder={false}
						/>
					</div>
				</div>
			</Match>

			<Match when={platform === "ios"}>
				<div id="section-telegram-ios">
					<div>
						<HeaderWidget
							project={project}
							platform="ios"
							title={`Telegram ${PlatformNames[projectFrame.platform]}`}
							projectFrameStore={[projectFrame, setProjectFrame]}
							placeholder={false}
						/>

						<ViewportIOS
							project={project}
							projectFrameStore={[projectFrame, setProjectFrame]}
							placeholder={false}
						/>
					</div>
				</div>
			</Match>
		</Switch>
	);
};

export default FloatingProject;
