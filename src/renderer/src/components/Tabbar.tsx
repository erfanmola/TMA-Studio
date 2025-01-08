import "./Tabbar.scss";

import { For, Show, createMemo } from "solid-js";
import { preferences, setPreferences } from "@renderer/utils/preferences";

import { IoClose } from "solid-icons/io";
import type { TabbarTab } from "../types";
import type { TelegramPlatform } from "@renderer/utils/themes";

export const closeTab = (id: TabbarTab["id"], fromTabId?: TabbarTab["id"]) => {
	const tab = preferences.tabbar.tabs.find((item) => item.id === id);
	if (!tab) return;
	if (!tab.closable) return;

	if (!fromTabId || id === fromTabId) {
		const index = preferences.tabbar.tabs.indexOf(tab);
		if (index > 0) {
			setPreferences("tabbar", "active", preferences.tabbar.tabs[index - 1].id);
		} else {
			setPreferences("tabbar", "active", "");
		}
	}

	setPreferences(
		"tabbar",
		"tabs",
		preferences.tabbar.tabs.filter((item) => item.id !== id),
	);

	if (id.startsWith("project-")) {
		window.api.project.close(
			id.replace("project-", ""),
			"" as TelegramPlatform,
			true,
		);
	}
};

export const Tabbar = () => {
	const activeTab = createMemo(() =>
		preferences.tabbar.tabs.find(
			(item) => item.id === preferences.tabbar.active,
		),
	);

	const onClickClose = (id: TabbarTab["id"]) => {
		closeTab(id, preferences.tabbar.active);
	};

	return (
		<div id="tabbar-main">
			<ul>
				<For each={preferences.tabbar.tabs}>
					{(item) => (
						<li
							classList={{ active: item.id === preferences.tabbar.active }}
							onMouseUp={(e) => {
								if (e.button === 1) {
									e.preventDefault();
									if (item.closable) {
										closeTab(item.id, preferences.tabbar.active);
									}
								}
							}}
							onClick={() => setPreferences("tabbar", "active", item.id)}
							title={item.title}
						>
							<span>{item.title}</span>
							<Show when={item.closable}>
								<IoClose
									onClick={(e) => {
										e.stopPropagation();
										onClickClose(item.id);
									}}
								/>
							</Show>
						</li>
					)}
				</For>
			</ul>

			<div>
				<Show when={activeTab()}>
					{activeTab()?.dynamic
						? (activeTab()?.component as CallableFunction)()
						: activeTab()?.component}
				</Show>
			</div>
		</div>
	);
};
