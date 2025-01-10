import "./Projects.scss";
import { Menu, MenuItem } from "@electron-uikit/contextmenu/renderer";

import { type Component, For, Show } from "solid-js";
import type { Project } from "../types";
import { openProject } from "../utils/project";
import ProjectPage from "./Project";
import KeyboardCombo from "../components/KeyboardCombo";
import DialogRemoveProject from "@renderer/components/DialogRemoveProject";
import { preferences, setModals } from "@renderer/utils/preferences";
import DialogEditProject from "@renderer/components/DialogEditProject";
import { createStore } from "solid-js/store";

export type ProjectContextMenuStore = {
	delete: {
		id: undefined | string;
		open: boolean;
	};
	edit: {
		id: undefined | string;
		open: boolean;
	};
};

const ProjectsPage: Component = () => {
	const [contextMenuStore, setContextMenuStore] =
		createStore<ProjectContextMenuStore>({
			delete: {
				id: undefined,
				open: false,
			},
			edit: {
				id: undefined,
				open: false,
			},
		});

	const openProjectInner = (projectId: Project["id"]) => {
		openProject(projectId, () => <ProjectPage id={projectId} />);
	};

	const onContextMenu = (projectId) => {
		const menu = new Menu();

		menu.append(
			new MenuItem({
				type: "normal",
				label: "Open Project",
				click: () => {
					openProjectInner(projectId);
				},
			}),
		);
		menu.append(new MenuItem({ type: "separator" }));
		menu.append(
			new MenuItem({
				type: "normal",
				label: "Edit Project",
				click: () => {
					setContextMenuStore("edit", {
						id: projectId,
						open: true,
					});
				},
			}),
		);
		menu.append(new MenuItem({ type: "separator" }));
		menu.append(
			new MenuItem({
				type: "normal",
				label: "Delete Project",
				click: () => {
					setContextMenuStore("delete", {
						id: projectId,
						open: true,
					});
				},
			}),
		);

		menu.popup();
	};

	return (
		<section id="container-section-projects">
			<Show
				when={(preferences.projects.length ?? 0) > 0}
				fallback={
					<div>
						<ul>
							<li>
								<p>New Project</p>
								<KeyboardCombo includeSuper={true} key="N" />
							</li>

							<li>
								<p>New User</p>
								<KeyboardCombo includeSuper={true} key="U" />
							</li>

							<li>
								<p>Toggle Sidebar</p>
								<KeyboardCombo includeSuper={true} key="B" />
							</li>

							<li>
								<p>Close Tab</p>
								<KeyboardCombo includeSuper={true} key="W" />
							</li>

							<li>
								<p>Open Preferences</p>
								<KeyboardCombo includeSuper={true} key="," />
							</li>

							<li>
								<p>Switch Tab</p>
								<KeyboardCombo includeSuper={false} key="Ctrl + Tab" />
							</li>
						</ul>

						<button
							type="button"
							onClick={() => setModals("project", "new", "open", true)}
						>
							Create New Project
						</button>
					</div>
				}
			>
				<ul>
					<For each={preferences.projects}>
						{(project) => (
							<li
								classList={{
									active:
										preferences.tabbar.tabs.find(
											(item) => item.id === `project-${project.id}`,
										) !== undefined,
								}}
								onClick={() => {
									openProjectInner(project.id);
								}}
								onContextMenu={(e) => {
									e.preventDefault();
									onContextMenu(project.id);
								}}
							>
								<h2>{project.name}</h2>
							</li>
						)}
					</For>
				</ul>
			</Show>

			<Show when={contextMenuStore.delete.open && contextMenuStore.delete.id}>
				<DialogRemoveProject
					ProjectContextMenuStore={[contextMenuStore, setContextMenuStore]}
				/>
			</Show>

			<Show when={contextMenuStore.edit.open && contextMenuStore.edit.id}>
				<DialogEditProject
					ProjectContextMenuStore={[contextMenuStore, setContextMenuStore]}
				/>
			</Show>
		</section>
	);
};

export default ProjectsPage;
