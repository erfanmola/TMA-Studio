import { createEffect, on, type Component } from "solid-js";

import { closeTab } from "./Tabbar";
import type { ProjectContextMenuStore } from "@renderer/pages/Projects";
import type { SetStoreFunction } from "solid-js/store";
import { preferences, setPreferences } from "@renderer/utils/preferences";
import Modal from "./Modal";

const DialogRemoveProject: Component<{
	ProjectContextMenuStore: [
		get: ProjectContextMenuStore,
		set: SetStoreFunction<ProjectContextMenuStore>,
	];
}> = (props) => {
	const [contextMenuStore, setContextMenuStore] = props.ProjectContextMenuStore;

	createEffect(
		on(
			() => contextMenuStore.delete.id,
			() => {
				if (!contextMenuStore.delete.open) {
					setContextMenuStore("delete", "id", undefined);
				}
			},
			{
				defer: true,
			},
		),
	);

	const onClickDelete = async () => {
		closeTab(`project-${contextMenuStore.delete.id}`);
		setPreferences(
			"projects",
			preferences.projects.filter(
				(item) => item.id !== contextMenuStore.delete.id,
			),
		);
		setContextMenuStore("delete", "open", false);
	};

	return (
		<Modal
			title="Delete Project"
			closer={() => setContextMenuStore("delete", "open", false)}
			footer={
				<div class="grid grid-cols-2 flex-grow gap-2">
					<button
						type="button"
						class="button-secondary"
						style={{ padding: "0.625rem" }}
						onClick={() => setContextMenuStore("delete", "open", false)}
					>
						Cancel
					</button>

					<button
						type="button"
						class="button-danger"
						style={{ padding: "0.625rem" }}
						onClick={onClickDelete}
					>
						Delete Project
					</button>
				</div>
			}
		>
			<div class="grid gap-5 py-1">
				<p style={{ "text-align": "initial" }}>
					Are you sure of deleting the{" "}
					<b>
						{
							preferences.projects.find(
								(item) => item.id === contextMenuStore.delete.id,
							)?.name
						}
					</b>{" "}
					project?
				</p>
			</div>
		</Modal>
	);
};

export default DialogRemoveProject;
