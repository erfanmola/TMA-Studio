import "./Main.scss";

import { Show, createSignal, onMount } from "solid-js";
import { Tabbar, setActiveTabId, setTabbarData } from "../components/Tabbar";

import DialogCreateProject from "../components/DialogCreateProject";
import { FaSolidPlus } from "solid-icons/fa";
import Footer from "../components/Footer";
import Header from "../components/Header";
import ProjectPage from "./Project";
import ProjectsPage from "./Projects";
import Sidebar from "../components/Sidebar";
import type { TabbarTab } from "../types";
import { useSettings } from "../contexts/SettingsContext";

const MainPage = () => {
	const { settings } = useSettings();
	const [showProjectDialog, setShowProjectDialog] = createSignal(false);

	onMount(async () => {
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
		</>
	);
};

export default MainPage;
