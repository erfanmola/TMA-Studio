import "./Preferences.scss";

import { preferences, setPreferences } from "@renderer/utils/preferences";

import type { Component } from "solid-js";
import { Switch } from "@kobalte/core/switch";

const PreferencesPage: Component = () => {
	return (
		<section id="container-section-preferences">
			<h1>Preferences</h1>

			<section>
				<h2>Theme Settings</h2>

				<ul>
					<li>
						<span>Theme Mode</span>

						<div>
							<Switch
								class="switch"
								checked={preferences.theme_mode === "dark"}
								onChange={(e) => {
									setPreferences("theme_mode", e ? "dark" : "light");
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
				</ul>
			</section>
		</section>
	);
};

export default PreferencesPage;
