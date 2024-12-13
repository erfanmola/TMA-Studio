import { ToggleButton } from "@kobalte/core/toggle-button";
import { useSettings } from "@renderer/contexts/SettingsContext";
import type { Project } from "@renderer/types";
import type { TelegramPlatform, ThemeMode } from "@renderer/utils/themes";
import { CgArrowTopRightR, CgArrowBottomLeftR } from "solid-icons/cg";
import { FaSolidCode } from "solid-icons/fa";
import { FiMoon, FiSun } from "solid-icons/fi";
import { IoChevronCollapse, IoChevronExpand } from "solid-icons/io";
import {
	type Component,
	type Signal,
	createEffect,
	on,
	onCleanup,
	onMount,
	Show,
} from "solid-js";

export const HeaderWidget: Component<{
	project: Project;
	platform: TelegramPlatform;
	title: string;
	signalMode: Signal<ThemeMode>;
	signalExpanded: Signal<boolean>;
	signalInspectElement: Signal<boolean>;
	signalOpen: Signal<boolean>;
	signalFloating: Signal<boolean>;
	placeholder: boolean;
}> = (props) => {
	const [mode, setMode] = props.signalMode;
	const [inspectElement, setInspectElement] = props.signalInspectElement;
	const [expanded, setExpanded] = props.signalExpanded;
	const [open, setOpen] = props.signalOpen;
	const [floating, setFloating] = props.signalFloating;

	const { settings } = useSettings();

	const handleProjectSync = (_) => {
		const projectsList = settings.get("projects") as Project[];
		const project = projectsList.find((item) => item.id === props.project.id);

		if (project) {
			setMode(project.settings[props.platform].mode);
			setExpanded(project.settings[props.platform].expanded);
			setOpen(project.settings[props.platform].open);
			setFloating(project.settings[props.platform].floating);
		}
	};

	createEffect(
		on(
			floating,
			() => {
				if (floating()) {
					setInspectElement(false);
					setTimeout(() => {
						window.project.open(props.project.id, props.platform);
					});
				} else if (!floating() && !props.placeholder) {
					setInspectElement(false);
					setTimeout(() => {
						window.project.close(props.project.id, props.platform, false);
					});
				}
			},
			{ defer: true },
		),
	);

	if (props.placeholder) {
		window.project.open(props.project.id, props.platform);
	}

	if (!floating() || props.placeholder) {
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
					<Show when={open()}>
						<li>
							<ToggleButton
								class="toggle-button"
								style={{ "font-size": "1.325rem" }}
								title="Inspect Element"
								pressed={inspectElement()}
								onChange={() => setInspectElement(!inspectElement())}
							>
								{() => <FaSolidCode />}
							</ToggleButton>
						</li>

						<li>
							<ToggleButton
								class="toggle-button"
								style={{ "font-size": "1.325rem" }}
								title="Expand / Collapse"
								pressed={expanded()}
								onChange={setExpanded}
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
							pressed={mode() === "dark"}
							onChange={() => setMode(mode() === "dark" ? "light" : "dark")}
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
							pressed={floating()}
							onChange={() => setFloating(!floating())}
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
