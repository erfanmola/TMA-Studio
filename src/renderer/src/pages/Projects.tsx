import "./Projects.scss";
import { Menu, useContextMenu, Item, Separator } from "solid-contextmenu";
import "solid-contextmenu/dist/style.css";

import {
	type Accessor,
	type Component,
	For,
	type Setter,
	Show,
} from "solid-js";
import type { Project } from "../types";
import { openProject, projects } from "../utils/project";
import ProjectPage from "./Project";
import KeyboardCombo from "../components/KeyboardCombo";
import { tabbarData } from "../components/Tabbar";
import DialogRemoveProject from "@renderer/components/DialogRemoveProject";
import { preferences } from "@renderer/utils/preferences";
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

const ProjectsPage: Component<{
	showProjectDialog: Accessor<boolean>;
	setShowProjectDialog: Setter<boolean>;
}> = (props) => {
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

	const onClickMenuProjectOpen = (e: any) => {
		openProjectInner(e.props);
	};

	const onClickMenuProjectEdit = (e: any) => {
		setContextMenuStore("edit", {
			id: e.props,
			open: true,
		});
	};

	const onClickMenuProjectDelete = (e: any) => {
		setContextMenuStore("delete", {
			id: e.props,
			open: true,
		});
	};

	return (
		<section id="container-section-projects">
			<Show
				when={(projects().length ?? 0) > 0}
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
							onClick={() => props.setShowProjectDialog(true)}
						>
							Create New Project
						</button>
					</div>
				}
			>
				<ul>
					<For each={projects()}>
						{(project) => (
							<li
								classList={{
									active:
										tabbarData().find(
											(item) => item.id === `project-${project.id}`,
										) !== undefined,
								}}
								onClick={() => {
									openProjectInner(project.id);
								}}
								onKeyUp={() => {
									openProjectInner(project.id);
								}}
								onContextMenu={(e) => {
									useContextMenu({ id: "menu-project" }).show(e, {
										props: project.id,
									});
								}}
							>
								<h2>{project.name}</h2>
							</li>
						)}
					</For>
				</ul>
			</Show>

			<Menu
				id={"menu-project"}
				animation="scale"
				theme={preferences.theme_mode}
			>
				<Item onClick={onClickMenuProjectOpen}>Open Project</Item>
				<Separator />
				<Item onClick={onClickMenuProjectEdit}>Edit Project</Item>
				<Separator />
				<Item onClick={onClickMenuProjectDelete}>Delete Project</Item>
			</Menu>

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
