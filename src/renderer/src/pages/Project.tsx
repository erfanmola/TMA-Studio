import "./Project.scss";

import { createEffect, createSignal, type Component } from "solid-js";
import { GridPattern } from "../components/GridPattern";
import type { Project } from "../types";
import { projects } from "../utils/project";

import type { TelegramPlatform, ThemeMode } from "../utils/themes";

import { useSettings } from "../contexts/SettingsContext";
import { ViewportAndroid } from "@renderer/sections/ViewportAndroid";
import { HeaderWidget } from "@renderer/sections/HeaderWidget";
import { ViewportIOS } from "@renderer/sections/ViewportIOS";

const SectionAndroid: Component<{ project: Project }> = (props) => {
	const platform: TelegramPlatform = "android";
	const { settings } = useSettings();

	const [mode, setMode] = createSignal<ThemeMode>(
		props.project.settings.android.mode,
	);
	const [expanded, setExpanded] = createSignal(
		props.project.settings.android.expanded,
	);
	const [inspectElement, setInspectElement] = createSignal(false);

	createEffect(async () => {
		props.project.settings.android.mode = mode();
		props.project.settings.android.expanded = expanded();
		settings.set("projects", projects());
	});

	return (
		<div id="section-telegram-android">
			<HeaderWidget
				title="Telegram Android"
				signalMode={[mode, setMode]}
				signalExpanded={[expanded, setExpanded]}
				signalInspectElement={[inspectElement, setInspectElement]}
			/>

			<ViewportAndroid
				project={props.project}
				platform={platform}
				signalMode={[mode, setMode]}
				signalExpanded={[expanded, setExpanded]}
				signalInspectElement={[inspectElement, setInspectElement]}
			/>
		</div>
	);
};

const SectionIOS: Component<{ project: Project }> = (props) => {
	const platform: TelegramPlatform = "ios";
	const { settings } = useSettings();

	const [mode, setMode] = createSignal<ThemeMode>(
		props.project.settings.ios.mode,
	);
	const [expanded, setExpanded] = createSignal(
		props.project.settings.ios.expanded,
	);
	const [inspectElement, setInspectElement] = createSignal(false);

	createEffect(async () => {
		props.project.settings.ios.mode = mode();
		props.project.settings.ios.expanded = expanded();
		settings.set("projects", projects());
	});

	return (
		<div id="section-telegram-ios">
			<HeaderWidget
				title="Telegram iOS"
				signalMode={[mode, setMode]}
				signalExpanded={[expanded, setExpanded]}
				signalInspectElement={[inspectElement, setInspectElement]}
			/>

			<ViewportIOS
				project={props.project}
				platform={platform}
				signalMode={[mode, setMode]}
				signalExpanded={[expanded, setExpanded]}
				signalInspectElement={[inspectElement, setInspectElement]}
			/>
		</div>
	);
};

const ProjectPage: Component<{ id: Project["id"] }> = (props) => {
	const project = projects().find((item) => item.id === props.id);

	return (
		<div id="container-page-project">
			<GridPattern
				width={32}
				height={32}
				x={-1}
				y={-1}
				strokeDasharray={"4 2"}
			/>

			<div>
				<SectionIOS project={project as Project} />

				<SectionAndroid project={project as Project} />
			</div>
		</div>
	);
};

export default ProjectPage;
