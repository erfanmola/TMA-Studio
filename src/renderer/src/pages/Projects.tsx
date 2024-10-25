import "./Projects.scss";

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

const ProjectsPage: Component<{
	showProjectDialog: Accessor<boolean>;
	setShowProjectDialog: Setter<boolean>;
}> = (props) => {
	const openProjectInner = (projectId: Project["id"]) => {
		openProject(projectId, () => <ProjectPage id={projectId} />);
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
							>
								<h2>{project.name}</h2>
							</li>
						)}
					</For>
				</ul>
			</Show>
		</section>
	);
};

export default ProjectsPage;
