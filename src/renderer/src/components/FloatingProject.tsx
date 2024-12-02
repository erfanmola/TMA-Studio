import "./FloatingProject.scss";

import {
	createEffect,
	createSignal,
	Match,
	Switch,
	type Component,
} from "solid-js";
import { useParams } from "@solidjs/router";
import { HeaderWidget } from "@renderer/sections/HeaderWidget";
import { ViewportAndroid } from "@renderer/sections/ViewportAndroid";
import { useSettings } from "@renderer/contexts/SettingsContext";
import type { TelegramPlatform, ThemeMode } from "@renderer/utils/themes";
import { projects } from "@renderer/utils/project";
import type { Project } from "@renderer/types";
import { ViewportIOS } from "@renderer/sections/ViewportIOS";
import { initStore } from "@renderer/utils/store";
import { preferences } from "@renderer/utils/preferences";

const FloatingProject: Component = () => {
	const params = useParams();
	const platform = params.platform as TelegramPlatform;

	initStore();

	const { settings } = useSettings();

	const project = projects().find(
		(item) => item.id === params.project,
	) as Project;

	const [mode, setMode] = createSignal<ThemeMode>(
		project.settings[platform].mode,
	);
	const [expanded, setExpanded] = createSignal(
		project.settings[platform].expanded,
	);
	const [inspectElement, setInspectElement] = createSignal(false);
	const [open, setOpen] = createSignal(project.settings[platform].open);
	const [floating, setFloating] = createSignal(
		project.settings[platform].floating,
	);

	createEffect(async () => {
		project.settings[platform].mode = mode();
		project.settings[platform].expanded = expanded();
		project.settings[platform].open = open();
		project.settings[platform].floating = floating();
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
							signalMode={[mode, setMode]}
							signalExpanded={[expanded, setExpanded]}
							signalInspectElement={[inspectElement, setInspectElement]}
							signalOpen={[open, setOpen]}
							signalFloating={[floating, setFloating]}
							placeholder={false}
						/>

						<ViewportAndroid
							project={project}
							platform={platform}
							signalMode={[mode, setMode]}
							signalExpanded={[expanded, setExpanded]}
							signalInspectElement={[inspectElement, setInspectElement]}
							signalOpen={[open, setOpen]}
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
							signalMode={[mode, setMode]}
							signalExpanded={[expanded, setExpanded]}
							signalInspectElement={[inspectElement, setInspectElement]}
							signalOpen={[open, setOpen]}
							signalFloating={[floating, setFloating]}
							placeholder={false}
						/>

						<ViewportIOS
							project={project}
							platform={platform}
							signalMode={[mode, setMode]}
							signalExpanded={[expanded, setExpanded]}
							signalInspectElement={[inspectElement, setInspectElement]}
							signalOpen={[open, setOpen]}
							placeholder={false}
						/>
					</div>
				</div>
			</Match>
		</Switch>
	);
};

export default FloatingProject;
