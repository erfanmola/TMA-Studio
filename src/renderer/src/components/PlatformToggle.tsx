import "./PlatformToggle.scss";

import { PlatformIcons } from "@renderer/utils/platforms";
import { preferences, setPreferences } from "@renderer/utils/preferences";
import { defaultProjectPlatforms } from "@renderer/utils/project";
import type { TelegramPlatform } from "@renderer/utils/themes";
import { For, type Component } from "solid-js";
import { produce } from "solid-js/store";

export const PlatformToggle: Component = () => {
	return (
		<ul id="container-platform-toggle">
			<For each={["android", "ios", "tdesktop"] as TelegramPlatform[]}>
				{(platform) => {
					setPreferences(
						produce((state) => {
							const project = state.projects.find(
								(item) =>
									item.id === preferences.tabbar.active.replace("project-", ""),
							);
							if (!project) return;

							if (!project.platforms) {
								project.platforms = defaultProjectPlatforms;
							}
						}),
					);

					return (
						<li
							class={`${platform}`}
							classList={{
								active: preferences.projects
									.find(
										(item) =>
											item.id ===
											preferences.tabbar.active.replace("project-", ""),
									)
									?.platforms!.includes(platform),
								disabled:
									(preferences.projects
										.find(
											(item) =>
												item.id ===
												preferences.tabbar.active.replace("project-", ""),
										)
										?.platforms!.includes(platform) &&
										preferences.projects.find(
											(item) =>
												item.id ===
												preferences.tabbar.active.replace("project-", ""),
										)!.platforms!.length < 2) ||
									(!preferences.projects
										.find(
											(item) =>
												item.id ===
												preferences.tabbar.active.replace("project-", ""),
										)!
										.platforms!.includes(platform) &&
										preferences.projects.find(
											(item) =>
												item.id ===
												preferences.tabbar.active.replace("project-", ""),
										)!.platforms!.length > 2),
							}}
							onClick={() =>
								setPreferences(
									produce((state) => {
										const project = state.projects.find(
											(item) =>
												item.id ===
												preferences.tabbar.active.replace("project-", ""),
										);
										if (!project) return;

										if (!project.platforms) {
											project.platforms = defaultProjectPlatforms;
										}

										if (project.platforms.includes(platform)) {
											project.platforms = project.platforms.filter(
												(item) => item !== platform,
											);
										} else {
											project.platforms.push(platform);
										}
									}),
								)
							}
						>
							<span>{PlatformIcons[platform]()}</span>
						</li>
					);
				}}
			</For>
		</ul>
	);
};
