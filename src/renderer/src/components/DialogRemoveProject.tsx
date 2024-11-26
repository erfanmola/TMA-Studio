import {
	createEffect,
	on,
	type Accessor,
	type Component,
	type Setter,
} from "solid-js";
import { projects, setProjects } from "../utils/project";

import { Button } from "@kobalte/core/button";
import { Dialog } from "@kobalte/core/dialog";
import { Separator } from "@kobalte/core/separator";
import { closeTab } from "./Tabbar";

const DialogRemoveProject: Component<{
	isOpen: Accessor<boolean>;
	setIsOpen: Setter<boolean>;
	projectId: Accessor<string | undefined>;
	setProjectId: Setter<string | undefined>;
}> = (props) => {
	createEffect(
		on(
			props.isOpen,
			() => {
				if (!props.isOpen()) {
					props.setProjectId(undefined);
				}
			},
			{
				defer: true,
			},
		),
	);

	const onClickDelete = async () => {
		closeTab(`project-${props.projectId()}`);
		setProjects(projects().filter((item) => item.id !== props.projectId()));
		props.setIsOpen(false);
	};

	return (
		<Dialog open={props.isOpen()} onOpenChange={() => props.setIsOpen(false)}>
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
										projects().find((item) => item.id === props.projectId())
											?.name
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
