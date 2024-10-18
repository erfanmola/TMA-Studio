import "./Home.scss";

import {
	type Accessor,
	type Component,
	For,
	type Setter,
	Show,
	Suspense,
	createResource,
	createSignal,
	onCleanup,
	onMount,
} from "solid-js";

import { Dialog } from "@ark-ui/solid/dialog";
import { FaSolidPlus } from "solid-icons/fa";
import Footer from "../components/Footer";
import Header from "../components/Header";
import KeyboardCombo from "../components/KeyboardCombo";
import { Portal } from "solid-js/web";
import type { Project } from "../types";
import Sidebar from "../components/Sidebar";
import { getOSKeyComboExpression } from "../utils/shortcut";
import hotkeys from "hotkeys-js";
import { useSettings } from "../contexts/SettingsContext";

const DialogProject: Component<{
	isOpen: Accessor<boolean>;
	setIsOpen: Setter<boolean>;
}> = (props) => {
	return (
		<Dialog.Root
			open={props.isOpen()}
			onOpenChange={() => props.setIsOpen(false)}
		>
			<Portal>
				<Dialog.Backdrop />
				<Dialog.Positioner>
					<Dialog.Content>
						<Dialog.Title>Dialog Title</Dialog.Title>
						<Dialog.Description>Dialog Description</Dialog.Description>
						<Dialog.CloseTrigger>Close</Dialog.CloseTrigger>
					</Dialog.Content>
				</Dialog.Positioner>
			</Portal>
		</Dialog.Root>
	);
};

const SectionProjects = () => {
	const perRow = 3;

	const { settings } = useSettings();
	const [projects] = createResource<Project[]>(async () => {
		const projects = (await settings?.get("projects")) as Project[] | undefined;
		if (!projects) {
			await settings?.set("projects", []);
		}
		return projects ?? [];
	});

	const [showProjectDialog, setShowProjectDialog] = createSignal(false);

	onMount(() => {
		hotkeys([getOSKeyComboExpression("n")].join(","), (_, handler) => {
			switch (handler.key) {
				case getOSKeyComboExpression("n"):
					onClickNewProject();
					break;
			}
		});
	});

	onCleanup(() => {
		hotkeys.unbind(getOSKeyComboExpression("n"));
	});

	const onClickNewProject = () => {
		setShowProjectDialog(true);
	};

	return (
		<>
			<div id="container-page-content">
				<Sidebar>
					<ul>
						<li onClick={onClickNewProject} onKeyUp={onClickNewProject}>
							<FaSolidPlus />
						</li>
					</ul>
				</Sidebar>

				<div>
					<section id="container-section-projects">
						<Suspense>
							<Show when={projects()}>
								<Show
									when={(projects()?.length ?? 0) > 0}
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

											<button type="button" onClick={onClickNewProject}>
												Create New Project
											</button>
										</div>
									}
								>
									<ul>
										<For each={projects()}>
											{(project) => <li class="project-item">Item</li>}
										</For>
										<li
											class="project-item-create-project"
											onClick={onClickNewProject}
											onKeyUp={onClickNewProject}
										>
											<FaSolidPlus />
											<span>Create new project</span>
										</li>
										<For
											each={Array.from(
												new Array(
													perRow - 1 - ((projects()?.length ?? 0) % perRow),
												),
											)}
										>
											{() => <li class="project-item-placeholder" />}
										</For>
									</ul>
								</Show>
							</Show>
						</Suspense>
					</section>

					<Footer />
				</div>
			</div>

			<DialogProject
				isOpen={showProjectDialog}
				setIsOpen={setShowProjectDialog}
			/>
		</>
	);
};

const HomePage = () => {
	return (
		<main id="container-page-home">
			<Header />

			<SectionProjects />
		</main>
	);
};

export default HomePage;
