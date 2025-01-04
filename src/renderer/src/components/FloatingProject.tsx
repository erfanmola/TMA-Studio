import "./FloatingProject.scss";

import { createEffect, Match, Switch, type Component } from "solid-js";
import { useParams } from "@solidjs/router";
import { HeaderWidget } from "@renderer/sections/HeaderWidget";
import { ViewportAndroid } from "@renderer/sections/ViewportAndroid";
import { useSettings } from "@renderer/contexts/SettingsContext";
import type { TelegramPlatform } from "@renderer/utils/themes";
import { projects } from "@renderer/utils/project";
import type { Project } from "@renderer/types";
import { ViewportIOS } from "@renderer/sections/ViewportIOS";
import { initStore } from "@renderer/utils/store";
import { preferences } from "@renderer/utils/preferences";
import { createStore } from "solid-js/store";
import type { TMAProjectFrame } from "@renderer/pages/Project";
import { generateProjectFrame } from "@renderer/utils/telegram";

const FloatingProject: Component = () => {
	const params = useParams();
	const platform = params.platform as TelegramPlatform;

	initStore();

	const { settings } = useSettings();

	const project = projects().find(
		(item) => item.id === params.project,
	) as Project;

	const [projectFrame, setProjectFrame] = createStore<TMAProjectFrame>(
		generateProjectFrame(platform, project),
	);

	createEffect(async () => {
		// TODO: handle this in a better place
		project.settings[platform].mode = projectFrame.state.mode;
		project.settings[platform].expanded = projectFrame.state.expanded;
		project.settings[platform].open = projectFrame.state.open;
		project.settings[platform].floating = projectFrame.window.floating;
		settings.set("projects", projects());
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
							title="Telegram Android"
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
							title="Telegram iOS"
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
