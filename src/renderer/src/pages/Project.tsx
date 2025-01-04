import "./Project.scss";

import { createEffect, type Component } from "solid-js";
import { GridPattern } from "../components/GridPattern";
import type { Project } from "../types";
import { projects } from "../utils/project";

import type { TelegramPlatform, ThemeMode } from "../utils/themes";

import { useSettings } from "../contexts/SettingsContext";
import { ViewportAndroid } from "@renderer/sections/ViewportAndroid";
import { HeaderWidget } from "@renderer/sections/HeaderWidget";
import { ViewportIOS } from "@renderer/sections/ViewportIOS";
import { createStore } from "solid-js/store";
import { generateProjectFrame } from "@renderer/utils/telegram";

export type TMAProjectFrame = {
	platform: TelegramPlatform;
	inspectElement: {
		open: boolean;
	};
	state: {
		open: boolean;
		expanded: boolean;
		mode: ThemeMode;
	};
	window: {
		floating: boolean;
	};
};

const SectionAndroid: Component<{ project: Project }> = (props) => {
	const platform: TelegramPlatform = "android";
	const { settings } = useSettings();

	const [projectFrame, setProjectFrame] = createStore<TMAProjectFrame>(
		generateProjectFrame(platform, props.project),
	);

	createEffect(async () => {
		// TODO: handle this in a better place
		props.project.settings[platform].mode = projectFrame.state.mode;
		props.project.settings[platform].expanded = projectFrame.state.expanded;
		props.project.settings[platform].open = projectFrame.state.open;
		props.project.settings[platform].floating = projectFrame.window.floating;
		settings.set("projects", projects());
	});

	return (
		<div id="section-telegram-android">
			<div>
				<HeaderWidget
					project={props.project}
					platform="android"
					title="Telegram Android"
					projectFrameStore={[projectFrame, setProjectFrame]}
					placeholder={projectFrame.window.floating}
				/>

				<ViewportAndroid
					project={props.project}
					projectFrameStore={[projectFrame, setProjectFrame]}
					placeholder={projectFrame.window.floating}
				/>
			</div>
		</div>
	);
};

const SectionIOS: Component<{ project: Project }> = (props) => {
	const platform: TelegramPlatform = "ios";
	const { settings } = useSettings();

	const [projectFrame, setProjectFrame] = createStore<TMAProjectFrame>(
		generateProjectFrame(platform, props.project),
	);

	createEffect(async () => {
		// TODO: handle this in a better place
		props.project.settings[platform].mode = projectFrame.state.mode;
		props.project.settings[platform].expanded = projectFrame.state.expanded;
		props.project.settings[platform].open = projectFrame.state.open;
		props.project.settings[platform].floating = projectFrame.window.floating;
		settings.set("projects", projects());
	});

	return (
		<div id="section-telegram-ios">
			<div>
				<HeaderWidget
					project={props.project}
					platform="ios"
					title="Telegram iOS"
					projectFrameStore={[projectFrame, setProjectFrame]}
					placeholder={projectFrame.window.floating}
				/>

				<ViewportIOS
					project={props.project}
					projectFrameStore={[projectFrame, setProjectFrame]}
					placeholder={projectFrame.window.floating}
				/>
			</div>
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
