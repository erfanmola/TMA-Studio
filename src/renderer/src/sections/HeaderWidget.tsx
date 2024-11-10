import { ToggleButton } from "@kobalte/core/toggle-button";
import type { ThemeMode } from "@renderer/utils/themes";
import { FaSolidCode, FaSolidSun, FaSolidMoon } from "solid-icons/fa";
import { IoChevronCollapse, IoChevronExpand } from "solid-icons/io";
import { type Component, type Signal, Show } from "solid-js";

export const HeaderWidget: Component<{
	title: string;
	signalMode: Signal<ThemeMode>;
	signalExpanded: Signal<boolean>;
	signalInspectElement: Signal<boolean>;
}> = (props) => {
	const [mode, setMode] = props.signalMode;
	const [inspectElement, setInspectElement] = props.signalInspectElement;
	const [expanded, setExpanded] = props.signalExpanded;

	return (
		<header>
			<h2>{props.title}</h2>

			<ul>
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

				<li>
					<ToggleButton
						class="toggle-button"
						style={{ "font-size": "1.325rem" }}
						title="Dark / Light"
						pressed={mode() === "dark"}
						onChange={() => setMode(mode() === "dark" ? "light" : "dark")}
					>
						{(state) => (
							<Show when={state.pressed()} fallback={<FaSolidSun />}>
								<FaSolidMoon />
							</Show>
						)}
					</ToggleButton>
				</li>
			</ul>
		</header>
	);
};
