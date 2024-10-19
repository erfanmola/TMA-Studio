import "./Tabbar.scss";

import { For, Show, createEffect, createMemo, createSignal } from "solid-js";

import { IoClose } from "solid-icons/io";
import type { TabbarTab } from "../types";
import { useSettings } from "../contexts/SettingsContext";

export const [tabbarData, setTabbarData] = createSignal<TabbarTab[]>([]);
export const [activeTabId, setActiveTabId] = createSignal("");

export const Tabbar = () => {
	const { settings } = useSettings();

	const activeTab = createMemo(() =>
		tabbarData().find((item) => item.id === activeTabId()),
	);

	const onClickClose = (id: TabbarTab["id"]) => {
		const tab = tabbarData().find((item) => item.id === id);
		if (!tab) return;
		const index = tabbarData().indexOf(tab);
		if (index > 0) {
			setActiveTabId(tabbarData()[index - 1].id);
		} else {
			setActiveTabId("");
		}
		setTabbarData(tabbarData().filter((item) => item.id !== id));
	};

	createEffect(async () => {
		const tabs = tabbarData().filter((item) => !["projects"].includes(item.id));
		await settings?.set("tabs", tabs);
		await settings?.save();
	});

	createEffect(async () => {
		if (activeTabId().length > 0) {
			await settings?.set("active_tab", activeTabId());
			await settings?.save();
		}
	});

	return (
		<div id="tabbar-main">
			<ul>
				<For each={tabbarData()}>
					{(item) => (
						<li
							classList={{ active: item.id === activeTabId() }}
							onClick={() => setActiveTabId(item.id)}
							onKeyUp={() => setActiveTabId(item.id)}
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
