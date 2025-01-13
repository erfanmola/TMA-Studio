import "./Preferences.scss";

import { preferences, setPreferences } from "@renderer/utils/preferences";

import {
	createEffect,
	createSignal,
	For,
	on,
	Show,
	type Component,
} from "solid-js";
import { HorizontalSelect } from "@renderer/components/HorizontalSelect";
import Switch from "@renderer/components/Switch";
import { createOptions, Select } from "@thisbeyond/solid-select";
import { Viewport } from "@renderer/utils/viewport";
import { FaSolidCheck } from "solid-icons/fa";
import { AiOutlineMobile } from "solid-icons/ai";
import type { TelegramPlatform } from "@renderer/utils/themes";
import { PlatformNames } from "@renderer/utils/platforms";

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
								checked={preferences.theme_mode === "dark"}
								onChange={(e) => {
									setPreferences("theme_mode", e ? "dark" : "light");
									window.electron.ipcRenderer.send(
										"theme-mode-changed",
										preferences.theme_mode,
									);
								}}
								label="Dark mode"
							/>
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
						<span>Haptic Feedback</span>

						<div>
							<Switch
								checked={preferences.project.shake_on_haptic}
								onChange={(e) => {
									setPreferences("project", "shake_on_haptic", e);
								}}
								label="Shake On Haptic"
							/>
						</div>
					</li>

					<Show when={window.electron.process.platform === "darwin"}>
						<li>
							<span />

							<div>
								<Switch
									checked={preferences.project.macos_vibrate_on_haptic}
									onChange={(e) => {
										setPreferences("project", "macos_vibrate_on_haptic", e);
									}}
									label="Vibrate On Haptic"
								/>
							</div>
						</li>
					</Show>

					<li>
						<span>Floating Window Mode</span>

						<div>
							<Switch
								checked={preferences.project.floating_window_on_top}
								onChange={(e) => {
									setPreferences("project", "floating_window_on_top", e);
								}}
								label="Always On Top"
							/>
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

			<section>
				<h2>Viewport Settings</h2>

				<ul>
					<For each={["android", "ios", "tdesktop"] as TelegramPlatform[]}>
						{(platform) => (
							<li>
								<span>{PlatformNames[platform]} Viewport</span>

								<div>
									<Select
										class="selectbox"
										{...createOptions(
											Viewport[platform].map((item) => ({
												label: item.name,
												value: item.size,
											})),
											{
												format: (item) => (
													<div
														class="flex items-center selectbox-item"
														classList={{
															active:
																item.value === preferences.viewport[platform],
														}}
													>
														<span style={{ "flex-grow": "1" }}>
															{item.label}
														</span>
														<Show
															when={
																item.value === preferences.viewport[platform]
															}
														>
															<FaSolidCheck />
														</Show>
													</div>
												),
												filterable: false,
												disable: (item) =>
													item.value === preferences.viewport[platform],
											},
										)}
										initialValue={{
											value: preferences.viewport[platform],
											label: Viewport[platform].find(
												(item) => item.size === preferences.viewport[platform],
											),
										}}
										format={(item, type) =>
											type === "value" ? (
												<div class="flex items-center">
													<span class="flex-grow">{item.label.name}</span>
													<AiOutlineMobile />
												</div>
											) : (
												item.label
											)
										}
										onChange={(item) =>
											setPreferences("viewport", platform, item.value)
										}
										readonly={true}
									/>
								</div>
							</li>
						)}
					</For>
				</ul>
			</section>
		</section>
	);
};

export default PreferencesPage;
