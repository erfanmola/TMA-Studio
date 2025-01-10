import "./Main.scss";

import { Show, createEffect, createSignal, onMount } from "solid-js";
import { Tabbar, closeTab } from "../components/Tabbar";
import {
	modals,
	preferences,
	setModals,
	setPreferences,
} from "@renderer/utils/preferences";

import DialogAddUser from "../components/DialogCreateUser";
import DialogCreateProject from "../components/DialogCreateProject";
import { FaSolidPlus } from "solid-icons/fa";
import { FiUserPlus } from "solid-icons/fi";
import Footer from "../components/Footer";
import Header from "../components/Header";
import PreferencesPage from "./Preferences";
import ProjectPage from "./Project";
import ProjectsPage from "./Projects";
import Sidebar from "../components/Sidebar";
import type { TabbarTab } from "@renderer/types";
import { deserializeObject } from "@renderer/utils/general";
import { initStore } from "@renderer/utils/store";
import { useSettings } from "../contexts/SettingsContext";

const MainPage = () => {
	const { settings } = useSettings();
	const [initialized, setInitialized] = createSignal(false);

	onMount(async () => {
		initStore();
		initStoreEffects();

		if (!preferences.tabbar.tabs.find((item) => item.id === "projects")) {
			setPreferences("tabbar", "tabs", [
				{
					id: "projects",
					title: "Projects",
					dynamic: true,
					closable: false,
					component: () => <ProjectsPage />,
				},
			]);
		}

		setPreferences(
			"tabbar",
			"tabs",
			preferences.tabbar.tabs.map((tab) => {
				let component: TabbarTab["component"];

				if (tab.id.startsWith("project-")) {
					component = () => <ProjectPage id={tab.id.replace("project-", "")} />;
				} else if (tab.id === "projects") {
					component = () => <ProjectsPage />;
				} else if (tab.id === "preferences") {
					component = () => <PreferencesPage />;
				} else {
					component = <div />;
				}

				return {
					...tab,
					component,
				};
			}),
		);

		setInitialized(true);
	});

	const initStoreEffects = () => {
		createEffect(() => {
			settings.set("preferences", deserializeObject(preferences));
		});

		createEffect(() => {
			document.body.classList.remove("light", "dark");
			document.body.classList.add(preferences.theme_mode);
		});
	};

	onMount(() => {
		window.api.onShortcutPressed((_, input) => {
			if (input.control || input.meta) {
				switch (input.key) {
					case "n":
						setModals("project", "new", "open", true);
						break;
					case "u":
						setModals("user", "new", "open", true);
						break;
					case "w":
						closeTab(preferences.tabbar.active);
						break;
					case "b":
						setPreferences(
							"ui",
							"sidebar",
							"visible",
							!preferences.ui.sidebar.visible,
						);
						break;
					case ",":
						if (
							!preferences.tabbar.tabs.find((item) => item.id === "preferences")
						) {
							setPreferences("tabbar", "tabs", [
								...preferences.tabbar.tabs,
								{
									id: "preferences",
									title: "Preferences",
									dynamic: true,
									component: () => <PreferencesPage />,
									closable: true,
								},
							]);
						}
						setPreferences("tabbar", "active", "preferences");
						break;
					case "Tab": {
						const activeTab = preferences.tabbar.tabs.find(
							(item) => item.id === preferences.tabbar.active,
						);
						if (!activeTab) return;
						const tabIndex = preferences.tabbar.tabs.indexOf(activeTab);
						if (input.modifiers.includes("shift")) {
							if (tabIndex > 0) {
								setPreferences(
									"tabbar",
									"active",
									preferences.tabbar.tabs[tabIndex - 1].id,
								);
							} else {
								setPreferences(
									"tabbar",
									"active",
									preferences.tabbar.tabs[preferences.tabbar.tabs.length - 1]
										.id,
								);
							}
						} else {
							if (tabIndex < preferences.tabbar.tabs.length - 1) {
								setPreferences(
									"tabbar",
									"active",
									preferences.tabbar.tabs[tabIndex + 1].id,
								);
							} else {
								setPreferences(
									"tabbar",
									"active",
									preferences.tabbar.tabs[0].id,
								);
							}
						}
						break;
					}
				}
			}
		});
	});

	return (
		<Show when={initialized()}>
			<main id="container-page-main">
				<Header />

				<div id="container-page-content">
					<Sidebar>
						<ul>
							<li onClick={() => setModals("project", "new", "open", true)}>
								<FaSolidPlus />
							</li>

							<li onClick={() => setModals("user", "new", "open", true)}>
								<FiUserPlus style={{ "font-size": "1.625rem" }} />
							</li>
						</ul>
					</Sidebar>

					<div>
						<Tabbar />

						<Footer />
					</div>
				</div>
			</main>

			<Show when={modals.project.new.open}>
				<DialogCreateProject />
			</Show>

			<Show when={modals.user.new.open}>
				<DialogAddUser />
			</Show>
		</Show>
	);
};

export default MainPage;
