import Toggle from "@renderer/components/Toggle";
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
							<Toggle
								style={{ "font-size": "1.325rem" }}
								title="Inspect Element"
								checked={projectFrame.inspectElement.open}
								onChange={() =>
									setProjectFrame(
										"inspectElement",
										"open",
										!projectFrame.inspectElement.open,
									)
								}
							>
								{() => <FaSolidCode />}
							</Toggle>
						</li>

						<Show when={["android", "ios"].includes(projectFrame.platform)}>
							<li>
								<Toggle
									style={{ "font-size": "1.325rem" }}
									title="Expand / Collapse"
									checked={projectFrame.state.expanded}
									onChange={(checked) =>
										setProjectFrame("state", "expanded", checked)
									}
								>
									{(checked) => (
										<Show when={checked} fallback={<IoChevronCollapse />}>
											<IoChevronExpand />
										</Show>
									)}
								</Toggle>
							</li>
						</Show>
					</Show>

					<li>
						<Toggle
							style={{ "font-size": "1.325rem" }}
							title="Dark / Light"
							checked={projectFrame.state.mode === "dark"}
							onChange={() =>
								setProjectFrame(
									"state",
									"mode",
									projectFrame.state.mode === "dark" ? "light" : "dark",
								)
							}
						>
							{(checked) => (
								<Show when={checked} fallback={<FiSun />}>
									<FiMoon />
								</Show>
							)}
						</Toggle>
					</li>

					<li>
						<Toggle
							style={{ "font-size": "1.425rem" }}
							title="Floating Window"
							checked={projectFrame.window.floating}
							onChange={() =>
								setProjectFrame(
									"window",
									"floating",
									!projectFrame.window.floating,
								)
							}
						>
							{(checked) => (
								<Show when={checked} fallback={<CgArrowTopRightR />}>
									<CgArrowBottomLeftR />
								</Show>
							)}
						</Toggle>
					</li>
				</ul>
			</Show>
		</header>
	);
};
