import "./Project.scss";

import { createEffect, createSignal, Show, type Component } from "solid-js";
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
	const [open, setOpen] = createSignal(props.project.settings.android.open);
	const [floating, setFloating] = createSignal(
		props.project.settings.android.floating,
	);

	createEffect(async () => {
		props.project.settings.android.mode = mode();
		props.project.settings.android.expanded = expanded();
		props.project.settings.android.open = open();
		props.project.settings.android.floating = floating();
		settings.set("projects", projects());
	});

	return (
		<div id="section-telegram-android">
			<HeaderWidget
				project={props.project}
				platform="android"
				title="Telegram Android"
				signalMode={[mode, setMode]}
				signalExpanded={[expanded, setExpanded]}
				signalInspectElement={[inspectElement, setInspectElement]}
				signalOpen={[open, setOpen]}
				signalFloating={[floating, setFloating]}
				placeholder={floating()}
			/>

			<ViewportAndroid
				project={props.project}
				platform={platform}
				signalMode={[mode, setMode]}
				signalExpanded={[expanded, setExpanded]}
				signalInspectElement={[inspectElement, setInspectElement]}
				signalOpen={[open, setOpen]}
				placeholder={floating()}
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
	const [open, setOpen] = createSignal(props.project.settings.ios.open);
	const [floating, setFloating] = createSignal(
		props.project.settings.ios.floating,
	);

	createEffect(async () => {
		props.project.settings.ios.mode = mode();
		props.project.settings.ios.expanded = expanded();
		props.project.settings.ios.open = open();
		props.project.settings.ios.floating = floating();
		settings.set("projects", projects());
	});

	return (
		<div id="section-telegram-ios">
			<HeaderWidget
				project={props.project}
				platform="ios"
				title="Telegram iOS"
				signalMode={[mode, setMode]}
				signalExpanded={[expanded, setExpanded]}
				signalInspectElement={[inspectElement, setInspectElement]}
				signalOpen={[open, setOpen]}
				signalFloating={[floating, setFloating]}
				placeholder={floating()}
			/>

			<ViewportIOS
				project={props.project}
				platform={platform}
				signalMode={[mode, setMode]}
				signalExpanded={[expanded, setExpanded]}
				signalInspectElement={[inspectElement, setInspectElement]}
				signalOpen={[open, setOpen]}
				placeholder={floating()}
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
