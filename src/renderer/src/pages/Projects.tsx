import "./Projects.scss";
import { Menu, useContextMenu, Item, Separator } from "solid-contextmenu";
import "solid-contextmenu/dist/style.css";

import {
	type Accessor,
	batch,
	type Component,
	createSignal,
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

const ProjectsPage: Component<{
	showProjectDialog: Accessor<boolean>;
	setShowProjectDialog: Setter<boolean>;
}> = (props) => {
	const [dialogDeleteProject, setDialogDeleteProject] =
		createSignal<boolean>(false);
	const [deleteProjectID, setDeleteProjectID] = createSignal<
		string | undefined
	>(undefined);

	const openProjectInner = (projectId: Project["id"]) => {
		openProject(projectId, () => <ProjectPage id={projectId} />);
	};

	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	const onClickMenuProjectOpen = (e: any) => {
		openProjectInner(e.props);
	};

	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	const onClickMenuProjectDelete = (e: any) => {
		batch(() => {
			setDeleteProjectID(e.props);
			setDialogDeleteProject(true);
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

			<Menu id={"menu-project"} animation="scale" theme="light">
				<Item onClick={onClickMenuProjectOpen}>Open Project</Item>
				<Separator />
				<Item onClick={onClickMenuProjectDelete}>Delete Project</Item>
			</Menu>

			<Show when={deleteProjectID()}>
				<DialogRemoveProject
					isOpen={dialogDeleteProject}
					setIsOpen={setDialogDeleteProject}
					projectId={deleteProjectID}
					setProjectId={setDeleteProjectID}
				/>
			</Show>
		</section>
	);
};

export default ProjectsPage;
