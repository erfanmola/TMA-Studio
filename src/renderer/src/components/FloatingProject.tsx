import "./FloatingProject.scss";

import { useSettings } from "@renderer/contexts/SettingsContext";
import type { TMAProjectFrame } from "@renderer/pages/Project";
import { HeaderWidget } from "@renderer/sections/HeaderWidget";
import { ViewportAndroid } from "@renderer/sections/ViewportAndroid";
import { ViewportDesktop } from "@renderer/sections/ViewportDesktop";
import { ViewportIOS } from "@renderer/sections/ViewportIOS";
import { ViewportMacOS } from "@renderer/sections/ViewportMacOS";
import { ViewportWeb } from "@renderer/sections/ViewportWeb";
import { ViewportWebA } from "@renderer/sections/ViewportWebA";
import type { Project } from "@renderer/types";
import { deserializeObject } from "@renderer/utils/general";
import { PlatformNames } from "@renderer/utils/platforms";
import { preferences, setPreferences } from "@renderer/utils/preferences";
import { initStore } from "@renderer/utils/store";
import { generateProjectFrame } from "@renderer/utils/telegram";
import type { TelegramPlatform } from "@renderer/utils/themes";
import { useParams } from "@solidjs/router";
import { type Component, createEffect, Match, Switch } from "solid-js";
import { createStore, produce } from "solid-js/store";

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
					projectItem.settings[platform] = {
						expanded: projectFrame.state.expanded,
						floating: projectFrame.window.floating,
						mode: projectFrame.state.mode,
						open: projectFrame.state.open,
					};
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
		<div id={`section-telegram-${platform}`}>
			<div>
				<HeaderWidget
					project={project}
					platform={platform}
					title={`Telegram ${PlatformNames[projectFrame.platform]}`}
					projectFrameStore={[projectFrame, setProjectFrame]}
					placeholder={false}
				/>
				<Switch>
					<Match when={platform === "android"}>
						<ViewportAndroid
							project={project}
							projectFrameStore={[projectFrame, setProjectFrame]}
							placeholder={false}
						/>
					</Match>

					<Match when={platform === "ios"}>
						<ViewportIOS
							project={project}
							projectFrameStore={[projectFrame, setProjectFrame]}
							placeholder={false}
						/>
					</Match>

					<Match when={platform === "tdesktop"}>
						<ViewportDesktop
							project={project}
							projectFrameStore={[projectFrame, setProjectFrame]}
							placeholder={false}
						/>
					</Match>

					<Match when={platform === "macos"}>
						<ViewportMacOS
							project={project}
							projectFrameStore={[projectFrame, setProjectFrame]}
							placeholder={false}
						/>
					</Match>

					<Match when={platform === "web"}>
						<ViewportWeb
							project={project}
							projectFrameStore={[projectFrame, setProjectFrame]}
							placeholder={false}
						/>
					</Match>

					<Match when={platform === "weba"}>
						<ViewportWebA
							project={project}
							projectFrameStore={[projectFrame, setProjectFrame]}
							placeholder={false}
						/>
					</Match>
				</Switch>
			</div>
		</div>
	);
};

export default FloatingProject;
