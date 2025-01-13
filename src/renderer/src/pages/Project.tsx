import "./Project.scss";

import { createEffect, type Component } from "solid-js";
import { GridPattern } from "../components/GridPattern";
import type { Project } from "../types";

import type { TelegramPlatform, ThemeMode } from "../utils/themes";

import { ViewportAndroid } from "@renderer/sections/ViewportAndroid";
import { HeaderWidget } from "@renderer/sections/HeaderWidget";
import { ViewportIOS } from "@renderer/sections/ViewportIOS";
import { createStore, produce } from "solid-js/store";
import { generateProjectFrame } from "@renderer/utils/telegram";
import { preferences, setPreferences } from "@renderer/utils/preferences";
import { PlatformNames } from "@renderer/utils/platforms";
import { ViewportDesktop } from "@renderer/sections/ViewportDesktop";

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

	const [projectFrame, setProjectFrame] = createStore<TMAProjectFrame>(
		generateProjectFrame(platform, props.project),
	);

	createEffect(async () => {
		// TODO: handle this in a better place
		setPreferences(
			produce((store) => {
				const projectItem = store.projects.find(
					(item) => item.id === props.project.id,
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

	return (
		<div id={`section-telegram-${platform}`}>
			<div>
				<HeaderWidget
					project={props.project}
					platform={platform}
					title={`Telegram ${PlatformNames[projectFrame.platform]}`}
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

	const [projectFrame, setProjectFrame] = createStore<TMAProjectFrame>(
		generateProjectFrame(platform, props.project),
	);

	createEffect(async () => {
		// TODO: handle this in a better place
		setPreferences(
			produce((store) => {
				const projectItem = store.projects.find(
					(item) => item.id === props.project.id,
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

	return (
		<div id={`section-telegram-${platform}`}>
			<div>
				<HeaderWidget
					project={props.project}
					platform={platform}
					title={`Telegram ${PlatformNames[projectFrame.platform]}`}
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

const SectionDesktop: Component<{ project: Project }> = (props) => {
	const platform: TelegramPlatform = "tdesktop";

	const [projectFrame, setProjectFrame] = createStore<TMAProjectFrame>(
		generateProjectFrame(platform, props.project),
	);

	createEffect(async () => {
		// TODO: handle this in a better place
		setPreferences(
			produce((store) => {
				const projectItem = store.projects.find(
					(item) => item.id === props.project.id,
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

	return (
		<div id={`section-telegram-${platform}`}>
			<div>
				<HeaderWidget
					project={props.project}
					platform={platform}
					title={`Telegram ${PlatformNames[projectFrame.platform]}`}
					projectFrameStore={[projectFrame, setProjectFrame]}
					placeholder={projectFrame.window.floating}
				/>

				<ViewportDesktop
					project={props.project}
					projectFrameStore={[projectFrame, setProjectFrame]}
					placeholder={projectFrame.window.floating}
				/>
			</div>
		</div>
	);
};

const ProjectPage: Component<{ id: Project["id"] }> = (props) => {
	const project = preferences.projects.find((item) => item.id === props.id);

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

				<SectionDesktop project={project as Project} />
			</div>
		</div>
	);
};

export default ProjectPage;
