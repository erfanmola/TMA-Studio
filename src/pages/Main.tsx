import "./Main.scss";

import {
	Show,
	createEffect,
	createSignal,
	on,
	onCleanup,
	onMount,
} from "solid-js";
import { Tabbar, setActiveTabId, setTabbarData } from "../components/Tabbar";
import { activeUserId, loadUsers } from "../utils/user";

import DialogAddUser from "../components/DialogCreateUser";
import DialogCreateProject from "../components/DialogCreateProject";
import { FaSolidPlus } from "solid-icons/fa";
import { FiUserPlus } from "solid-icons/fi";
import Footer from "../components/Footer";
import Header from "../components/Header";
import ProjectPage from "./Project";
import ProjectsPage from "./Projects";
import Sidebar from "../components/Sidebar";
import type { TabbarTab } from "../types";
import { getOSKeyComboExpression } from "../utils/shortcut";
import hotkeys from "hotkeys-js";
import { useSettings } from "../contexts/SettingsContext";

const MainPage = () => {
	const { settings } = useSettings();
	const [showProjectDialog, setShowProjectDialog] = createSignal(false);
	const [showUserDialog, setShowUserDialog] = createSignal(false);

	onMount(async () => {
		loadUsers();

		const tabs = ((await settings?.get("tabs")) as TabbarTab[]) ?? [];
		const activeTab =
			((await settings?.get("active_tab")) as string) ?? "projects";

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
					component = <ProjectPage id={tab.id.replace("project-", "")} />;
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
	});

	onMount(() => {
		hotkeys(
			[getOSKeyComboExpression("n"), getOSKeyComboExpression("u")].join(","),
			(_, handler) => {
				switch (handler.key) {
					case getOSKeyComboExpression("n"):
						setShowProjectDialog(true);
						break;
					case getOSKeyComboExpression("u"):
						setShowUserDialog(true);
						break;
				}
			},
		);
	});

	onCleanup(() => {
		hotkeys.unbind(getOSKeyComboExpression("n"));
		hotkeys.unbind(getOSKeyComboExpression("u"));
	});

	createEffect(
		on(
			activeUserId,
			async () => {
				await settings?.set("active_user", activeUserId());
				await settings?.save();
			},
			{ defer: true },
		),
	);

	return (
		<>
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
		</>
	);
};

export default MainPage;
