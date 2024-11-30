import { ToggleButton } from "@kobalte/core/toggle-button";
import type { Project } from "@renderer/types";
import type { TelegramPlatform, ThemeMode } from "@renderer/utils/themes";
import { CgArrowTopRightR, CgArrowBottomLeftR } from "solid-icons/cg";
import { FaSolidCode, FaRegularMoon, FaRegularSun } from "solid-icons/fa";
import { IoChevronCollapse, IoChevronExpand } from "solid-icons/io";
import { type Component, type Signal, createEffect, on, Show } from "solid-js";

export const HeaderWidget: Component<{
	project: Project;
	platform: TelegramPlatform;
	title: string;
	signalMode: Signal<ThemeMode>;
	signalExpanded: Signal<boolean>;
	signalInspectElement: Signal<boolean>;
	signalOpen: Signal<boolean>;
	signalFloating: Signal<boolean>;
}> = (props) => {
	const [mode, setMode] = props.signalMode;
	const [inspectElement, setInspectElement] = props.signalInspectElement;
	const [expanded, setExpanded] = props.signalExpanded;
	const [open] = props.signalOpen;
	const [floating, setFloating] = props.signalFloating;

	createEffect(
		on(
			floating,
			() => {
				if (floating()) {
					window.project.open(props.project.id, props.platform);
					setFloating(true);
				} else {
					// close window
				}
			},
			{ defer: true },
		),
	);

	return (
		<header>
			<h2>{props.title}</h2>

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
							<Show when={state.pressed()} fallback={<FaRegularSun />}>
								<FaRegularMoon />
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
		</header>
	);
};
