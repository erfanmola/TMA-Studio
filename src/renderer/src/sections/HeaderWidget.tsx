import { ToggleButton } from "@kobalte/core/toggle-button";
import { useSettings } from "@renderer/contexts/SettingsContext";
import type { TMAProjectFrame } from "@renderer/pages/Project";
import type { Project } from "@renderer/types";
import type { TelegramPlatform } from "@renderer/utils/themes";
import { CgArrowTopRightR, CgArrowBottomLeftR } from "solid-icons/cg";
import { FaSolidCode } from "solid-icons/fa";
import { FiMoon, FiSun } from "solid-icons/fi";
import { IoChevronCollapse, IoChevronExpand } from "solid-icons/io";
import {
	type Component,
	createEffect,
	on,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import type { SetStoreFunction } from "solid-js/store";

export const HeaderWidget: Component<{
	project: Project;
	platform: TelegramPlatform;
	title: string;
	projectFrameStore: [TMAProjectFrame, SetStoreFunction<TMAProjectFrame>];
	placeholder: boolean;
}> = (props) => {
	const [projectFrame, setProjectFrame] = props.projectFrameStore;

	const { settings } = useSettings();

	const handleProjectSync = (_) => {
		const projectsList = settings.get("preferences.projects") as Project[];
		const project = projectsList.find((item) => item.id === props.project.id);

		if (project) {
			setProjectFrame({
				state: {
					mode: project.settings[props.platform].mode,
					expanded: project.settings[props.platform].expanded,
					open: project.settings[props.platform].open,
				},
				window: {
					floating: project.settings[props.platform].floating,
				},
			});
		}
	};

	createEffect(
		on(
			() => projectFrame.window.floating,
			() => {
				if (projectFrame.window.floating) {
					setProjectFrame("inspectElement", "open", false);
					setTimeout(() => {
						window.api.project.open(props.project.id, props.platform);
					});
				} else if (!projectFrame.window.floating && !props.placeholder) {
					setProjectFrame("inspectElement", "open", false);
					setTimeout(() => {
						window.api.project.close(props.project.id, props.platform, false);
					});
				}
			},
			{ defer: true },
		),
	);

	if (props.placeholder) {
		window.api.project.open(props.project.id, props.platform);
	}

	if (!projectFrame.window.floating || props.placeholder) {
		onMount(() => {
			window.electron.ipcRenderer.on(
				`sync-project-${props.project.id}-${props.platform}`,
				handleProjectSync,
			);

			onCleanup(() => {
				window.electron.ipcRenderer.removeAllListeners(
					`sync-project-${props.project.id}-${props.platform}`,
				);
			});
		});
	}

	return (
		<header>
			<h2>{props.title}</h2>

			<Show when={!props.placeholder}>
				<ul>
					<Show when={projectFrame.state.open}>
						<li>
							<ToggleButton
								class="toggle-button"
								style={{ "font-size": "1.325rem" }}
								title="Inspect Element"
								pressed={projectFrame.inspectElement.open}
								onChange={() =>
									setProjectFrame(
										"inspectElement",
										"open",
										!projectFrame.inspectElement.open,
									)
								}
							>
								{() => <FaSolidCode />}
							</ToggleButton>
						</li>

						<li>
							<ToggleButton
								class="toggle-button"
								style={{ "font-size": "1.325rem" }}
								title="Expand / Collapse"
								pressed={projectFrame.state.expanded}
								onChange={(checked) =>
									setProjectFrame("state", "expanded", checked)
								}
							>
								{(state) => (
									<Show when={state.pressed()} fallback={<IoChevronCollapse />}>
										<IoChevronExpand />
									</Show>
								)}
							</ToggleButton>
						</li>
					</Show>

					<li>
						<ToggleButton
							class="toggle-button"
							style={{ "font-size": "1.325rem" }}
							title="Dark / Light"
							pressed={projectFrame.state.mode === "dark"}
							onChange={() =>
								setProjectFrame(
									"state",
									"mode",
									projectFrame.state.mode === "dark" ? "light" : "dark",
								)
							}
						>
							{(state) => (
								<Show when={state.pressed()} fallback={<FiSun />}>
									<FiMoon />
								</Show>
							)}
						</ToggleButton>
					</li>

					<li>
						<ToggleButton
							class="toggle-button"
							style={{ "font-size": "1.425rem" }}
							title="Floating Window"
							pressed={projectFrame.window.floating}
							onChange={() =>
								setProjectFrame(
									"window",
									"floating",
									!projectFrame.window.floating,
								)
							}
						>
							{(state) => (
								<Show when={state.pressed()} fallback={<CgArrowTopRightR />}>
									<CgArrowBottomLeftR />
								</Show>
							)}
						</ToggleButton>
					</li>
				</ul>
			</Show>
		</header>
	);
};
