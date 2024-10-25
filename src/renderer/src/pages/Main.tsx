import "./Main.scss";

import { Show, createEffect, createSignal, on, onMount } from "solid-js";
import Sidebar, {
	setSidebarVisibility,
	sidebarVisiblity,
} from "../components/Sidebar";
import {
	Tabbar,
	activeTabId,
	closeTab,
	setActiveTabId,
	setTabbarData,
} from "../components/Tabbar";
import { activeUserId, users } from "../utils/user";

import DialogAddUser from "../components/DialogCreateUser";
import DialogCreateProject from "../components/DialogCreateProject";
import { FaSolidPlus } from "solid-icons/fa";
import { FiUserPlus } from "solid-icons/fi";
import Footer from "../components/Footer";
import Header from "../components/Header";
import ProjectPage from "./Project";
import ProjectsPage from "./Projects";
import type { TabbarTab } from "../types";
import { initStore } from "@renderer/utils/store";
import { projects } from "../utils/project";
import { useSettings } from "../contexts/SettingsContext";

const MainPage = () => {
	const { settings } = useSettings();
	const [initialized, setInitialized] = createSignal(false);

	const [showProjectDialog, setShowProjectDialog] = createSignal(false);
	const [showUserDialog, setShowUserDialog] = createSignal(false);

	onMount(async () => {
		initStore();
		initStoreEffects();

		const tabs = (settings.get("tabs") as TabbarTab[]) ?? [];
		const activeTab = (settings.get("active_tab") as string) ?? "projects";

		setTabbarData([
			{
				id: "projects",
				title: "Projects",
				dynamic: true,
				closable: false,
				component: () => (
					<ProjectsPage
						setShowProjectDialog={setShowProjectDialog}
						showProjectDialog={showProjectDialog}
					/>
				),
			},
			...tabs.map((tab) => {
				let component: TabbarTab["component"];

				if (tab.id.startsWith("project-")) {
					component = () => <ProjectPage id={tab.id.replace("project-", "")} />;
				} else {
					component = <div />;
				}

				return {
					...tab,
					component,
				};
			}),
		]);
		setActiveTabId(activeTab);

		setInitialized(true);
	});

	const initStoreEffects = () => {
		createEffect(
			on(
				projects,
				async () => {
					settings.set("projects", projects());
				},
				{ defer: true },
			),
		);

		createEffect(
			on(
				users,
				async () => {
					settings.set("users", users());
				},
				{ defer: true },
			),
		);
	};

	onMount(() => {
		window.onShortcutPressed((_, input) => {
			if (input.control || input.meta) {
				switch (input.key) {
					case "n":
						setShowProjectDialog(true);
						break;
					case "u":
						setShowUserDialog(true);
						break;
					case "w":
						closeTab(activeTabId());
						break;
					case "b":
						setSidebarVisibility(!sidebarVisiblity());
						break;
				}
			}
		});
	});

	createEffect(
		on(
			activeUserId,
			async () => {
				settings.set("active_user", activeUserId());
			},
			{ defer: true },
		),
	);

	return (
		<Show when={initialized()}>
			<main id="container-page-main">
				<Header />

				<div id="container-page-content">
					<Sidebar>
						<ul>
							<li
								onClick={() => setShowProjectDialog(true)}
								onKeyUp={() => setShowProjectDialog(true)}
							>
								<FaSolidPlus />
							</li>

							<li
								onClick={() => setShowUserDialog(true)}
								onKeyUp={() => setShowUserDialog(true)}
							>
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

			<Show when={showProjectDialog()}>
				<DialogCreateProject
					isOpen={showProjectDialog}
					setIsOpen={setShowProjectDialog}
				/>
			</Show>

			<Show when={showUserDialog()}>
				<DialogAddUser isOpen={showUserDialog} setIsOpen={setShowUserDialog} />
			</Show>
		</Show>
	);
};

export default MainPage;
