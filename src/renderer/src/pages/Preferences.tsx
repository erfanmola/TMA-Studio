import "./Preferences.scss";

import { preferences, setPreferences } from "@renderer/utils/preferences";

import { createEffect, createSignal, on, type Component } from "solid-js";
import { Switch } from "@kobalte/core/switch";
import { HorizontalSelect } from "@renderer/components/HorizontalSelect";

const PreferencesPage: Component = () => {
	const [hsUIScale, setHSUIScale] = createSignal(preferences.ui.scale);
	createEffect(
		on(
			hsUIScale,
			() => {
				setPreferences("ui", "scale", hsUIScale());
				window.electron.ipcRenderer.send("ui-scale-changed", hsUIScale());
			},
			{ defer: true },
		),
	);

	const [hsFWSize, setHSFWSize] = createSignal(
		preferences.project.floating_window_size,
	);
	createEffect(
		on(
			hsFWSize,
			() => {
				setPreferences("project", "floating_window_size", hsFWSize());
			},
			{ defer: true },
		),
	);

	return (
		<section id="container-section-preferences">
			<h1>Preferences</h1>

			<section>
				<h2>UI Settings</h2>

				<ul>
					<li>
						<span>Theme Mode</span>

						<div>
							<Switch
								class="switch"
								checked={preferences.theme_mode === "dark"}
								onChange={(e) => {
									setPreferences("theme_mode", e ? "dark" : "light");
									window.electron.ipcRenderer.send(
										"theme-mode-changed",
										preferences.theme_mode,
									);
								}}
							>
								<Switch.Label class="switch__label">Dark mode</Switch.Label>
								<Switch.Input class="switch__input" />
								<Switch.Control class="switch__control">
									<Switch.Thumb class="switch__thumb" />
								</Switch.Control>
							</Switch>
						</div>
					</li>

					<li>
						<span>UI Scaling</span>

						<div>
							<HorizontalSelect
								items={[
									{
										title: "75%",
										value: 0.75,
									},
									{
										title: "90%",
										value: 0.9,
									},
									{
										title: "100%",
										value: 1,
									},
									{
										title: "125%",
										value: 1.25,
									},
									{
										title: "150%",
										value: 1.5,
									},
								]}
								signal={[hsUIScale, setHSUIScale]}
							/>
						</div>
					</li>
				</ul>
			</section>

			<section>
				<h2>Project Settings</h2>

				<ul>
					<li>
						<span>Floating Window Mode</span>

						<div>
							<Switch
								class="switch"
								checked={preferences.project.floating_window_on_top}
								onChange={(e) => {
									setPreferences("project", "floating_window_on_top", e);
								}}
							>
								<Switch.Label class="switch__label">Always On Top</Switch.Label>
								<Switch.Input class="switch__input" />
								<Switch.Control class="switch__control">
									<Switch.Thumb class="switch__thumb" />
								</Switch.Control>
							</Switch>
						</div>
					</li>

					<li>
						<span>Floating Window Size</span>

						<div>
							<HorizontalSelect
								items={[
									{
										title: "Very Small",
										value: 320,
									},
									{
										title: "Small",
										value: 360,
									},
									{
										title: "Normal",
										value: 420,
									},
									{
										title: "Large",
										value: 480,
									},
								]}
								signal={[hsFWSize, setHSFWSize]}
							/>
						</div>
					</li>
				</ul>
			</section>
		</section>
	);
};

export default PreferencesPage;
