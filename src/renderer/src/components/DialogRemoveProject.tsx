import { createEffect, on, type Component } from "solid-js";
import { projects, setProjects } from "../utils/project";

import { Button } from "@kobalte/core/button";
import { Dialog } from "@kobalte/core/dialog";
import { Separator } from "@kobalte/core/separator";
import { closeTab } from "./Tabbar";
import type { ProjectContextMenuStore } from "@renderer/pages/Projects";
import type { SetStoreFunction } from "solid-js/store";

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
		setProjects(
			projects().filter((item) => item.id !== contextMenuStore.delete.id),
		);
		setContextMenuStore("delete", "open", false);
	};

	return (
		<Dialog
			open={contextMenuStore.delete.open}
			onOpenChange={() => setContextMenuStore("delete", "open", false)}
		>
			<Dialog.Portal>
				<Dialog.Overlay class="dialog__overlay" />
				<div class="dialog__positioner">
					<Dialog.Content class="dialog__content">
						<div class="dialog__header">
							<Dialog.Title class="dialog__title">Delete Project</Dialog.Title>
						</div>

						<Separator />

						<div class="grid gap-4 py-4">
							<p>
								Are you sure of deleting the{" "}
								<b>
									{
										projects().find(
											(item) => item.id === contextMenuStore.delete.id,
										)?.name
									}
								</b>{" "}
								project?
							</p>
						</div>

						<Separator />

						<div class="pt-3 flex justify-end gap-4">
							<Dialog.CloseButton>
								<Button>Cancel</Button>
							</Dialog.CloseButton>

							<Button class="button" onClick={onClickDelete}>
								Delete
							</Button>
						</div>
					</Dialog.Content>
				</div>
			</Dialog.Portal>
		</Dialog>
	);
};

export default DialogRemoveProject;
