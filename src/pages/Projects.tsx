import "./Projects.scss";

import hotkeys from "hotkeys-js";
import {
	type Accessor,
	type Component,
	createResource,
	For,
	onCleanup,
	onMount,
	type Setter,
	Show,
	Suspense,
} from "solid-js";
import type { Project } from "../types";
import { loadProjects, openProject, projects } from "../utils/project";
import { getOSKeyComboExpression } from "../utils/shortcut";
import ProjectPage from "./Project";
import KeyboardCombo from "../components/KeyboardCombo";
import { tabbarData } from "../components/Tabbar";

const ProjectsPage: Component<{
	showProjectDialog: Accessor<boolean>;
	setShowProjectDialog: Setter<boolean>;
}> = (props) => {
	const [projectsLoaded] = createResource<boolean>(async () => {
		return await loadProjects();
	});

	onMount(() => {
		hotkeys([getOSKeyComboExpression("n")].join(","), (_, handler) => {
			switch (handler.key) {
				case getOSKeyComboExpression("n"):
					props.setShowProjectDialog(true);
					break;
			}
		});
	});

	onCleanup(() => {
		hotkeys.unbind(getOSKeyComboExpression("n"));
	});

	const openProjectInner = (projectId: Project["id"]) => {
		openProject(projectId, <ProjectPage id={projectId} />);
	};

	return (
		<section id="container-section-projects">
			<Suspense>
				<Show when={projectsLoaded()}>
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
				</Show>
			</Suspense>
		</section>
	);
};

export default ProjectsPage;
