import "./Project.scss";

import {
	createEffect,
	For,
	Match,
	Show,
	Switch,
	type Component,
} from "solid-js";
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
import { defaultProjectPlatforms } from "@renderer/utils/project";
import { ViewportMacOS } from "@renderer/sections/ViewportMacOS";

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

const SectionPlatform: Component<{
	project: Project;
	platform: TelegramPlatform;
}> = (props) => {
	const [projectFrame, setProjectFrame] = createStore<TMAProjectFrame>(
		generateProjectFrame(props.platform, props.project),
	);

	createEffect(async () => {
		// TODO: handle this in a better place
		setPreferences(
			produce((store) => {
				const projectItem = store.projects.find(
					(item) => item.id === props.project.id,
				);

				if (projectItem) {
					projectItem.settings[props.platform] = {
						expanded: projectFrame.state.expanded,
						floating: projectFrame.window.floating,
						mode: projectFrame.state.mode,
						open: projectFrame.state.open,
					};
				}
			}),
		);
	});

	return (
		<div id={`section-telegram-${props.platform}`}>
			<div>
				<HeaderWidget
					project={props.project}
					platform={props.platform}
					title={`Telegram ${PlatformNames[projectFrame.platform]}`}
					projectFrameStore={[projectFrame, setProjectFrame]}
					placeholder={projectFrame.window.floating}
				/>

				<Switch>
					<Match when={props.platform === "android"}>
						<ViewportAndroid
							project={props.project}
							projectFrameStore={[projectFrame, setProjectFrame]}
							placeholder={projectFrame.window.floating}
						/>
					</Match>

					<Match when={props.platform === "ios"}>
						<ViewportIOS
							project={props.project}
							projectFrameStore={[projectFrame, setProjectFrame]}
							placeholder={projectFrame.window.floating}
						/>
					</Match>

					<Match when={props.platform === "tdesktop"}>
						<ViewportDesktop
							project={props.project}
							projectFrameStore={[projectFrame, setProjectFrame]}
							placeholder={projectFrame.window.floating}
						/>
					</Match>

					<Match when={props.platform === "macos"}>
						<ViewportMacOS
							project={props.project}
							projectFrameStore={[projectFrame, setProjectFrame]}
							placeholder={projectFrame.window.floating}
						/>
					</Match>
				</Switch>
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
				<For
					each={["ios", "android", "tdesktop", "macos"] as TelegramPlatform[]}
				>
					{(platform) => (
						<Show
							when={(project?.platforms ?? defaultProjectPlatforms).includes(
								platform,
							)}
						>
							<SectionPlatform
								project={project as Project}
								platform={platform}
							/>
						</Show>
					)}
				</For>
			</div>
		</div>
	);
};

export default ProjectPage;
