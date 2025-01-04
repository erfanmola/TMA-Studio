import "./Tabbar.scss";

import { For, Show, createEffect, createMemo, createSignal } from "solid-js";

import { IoClose } from "solid-icons/io";
import type { TabbarTab } from "../types";
import type { TelegramPlatform } from "@renderer/utils/themes";
import { deserializeObject } from "@renderer/utils/general";
import { useSettings } from "../contexts/SettingsContext";

export const [tabbarData, setTabbarData] = createSignal<TabbarTab[]>([]);
export const [activeTabId, setActiveTabId] = createSignal("");

export const closeTab = (id: TabbarTab["id"]) => {
	const tab = tabbarData().find((item) => item.id === id);
	if (!tab) return;
	if (!tab.closable) return;
	const index = tabbarData().indexOf(tab);
	if (index > 0) {
		setActiveTabId(tabbarData()[index - 1].id);
	} else {
		setActiveTabId("");
	}
	setTabbarData(tabbarData().filter((item) => item.id !== id));

	if (id.startsWith("project-")) {
		window.project.close(
			id.replace("project-", ""),
			"" as TelegramPlatform,
			true,
		);
	}
};

export const Tabbar = () => {
	const { settings } = useSettings();

	const activeTab = createMemo(() =>
		tabbarData().find((item) => item.id === activeTabId()),
	);

	const onClickClose = (id: TabbarTab["id"]) => {
		closeTab(id);
	};

	createEffect(async () => {
		const tabs = tabbarData().filter((item) => !["projects"].includes(item.id));
		settings.set("tabs", deserializeObject(tabs));
	});

	createEffect(async () => {
		if (activeTabId().length > 0) {
			settings.set("active_tab", activeTabId());
		}
	});

	return (
		<div id="tabbar-main">
			<ul>
				<For each={tabbarData()}>
					{(item) => (
						<li
							classList={{ active: item.id === activeTabId() }}
							onMouseUp={(e) => {
								if (e.button === 1) {
									e.preventDefault();
									if (item.closable) {
										closeTab(item.id);
									}
								}
							}}
							onClick={() => setActiveTabId(item.id)}
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
