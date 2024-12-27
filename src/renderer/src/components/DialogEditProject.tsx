import { createEffect, on, type Component } from "solid-js";
import { projects, setProjects } from "../utils/project";
import validator from "validator";

import { Button } from "@kobalte/core/button";
import { Dialog } from "@kobalte/core/dialog";
import { Separator } from "@kobalte/core/separator";
import { closeTab } from "./Tabbar";
import type { ProjectContextMenuStore } from "@renderer/pages/Projects";
import { createStore, type SetStoreFunction } from "solid-js/store";
import { TextField } from "@kobalte/core/text-field";
import { deserializeObject } from "@renderer/utils/general";

const DialogEditProject: Component<{
	ProjectContextMenuStore: [
		get: ProjectContextMenuStore,
		set: SetStoreFunction<ProjectContextMenuStore>,
	];
}> = (props) => {
	const [contextMenuStore, setContextMenuStore] = props.ProjectContextMenuStore;

	createEffect(
		on(
			() => contextMenuStore.edit.id,
			() => {
				if (!contextMenuStore.edit.open) {
					setContextMenuStore("edit", "id", undefined);
				}
			},
			{
				defer: true,
			},
		),
	);

	const project = projects().find(
		(item) => item.id === contextMenuStore.edit.id,
	);

	if (!project) return;

	const [form, setForm] = createStore({
		name: project.name,
		url: project.url,
		token: project.token ?? "",
		valid: false,
	});

	createEffect(() => {
		setForm(
			"valid",
			form.name.length > 0 &&
				form.name.length <= 64 &&
				(validator.isURL(form.url) ||
					validator.isURL(form.url, { host_whitelist: ["localhost"] })),
		);
	});

	const onClickEdit = async () => {
		closeTab(`project-${contextMenuStore.edit.id}`);

		const projectsList = deserializeObject(projects());
		const project = projectsList.find(
			(item) => item.id === contextMenuStore.edit.id,
		);

		if (!project) return;

		project.name = form.name;
		project.url = form.url;
		project.token = form.token;

		setProjects(projectsList);
		setContextMenuStore("edit", "open", false);
	};

	return (
		<Dialog
			open={contextMenuStore.edit.open}
			onOpenChange={() => setContextMenuStore("edit", "open", false)}
		>
			<Dialog.Portal>
				<Dialog.Overlay class="dialog__overlay" />
				<div class="dialog__positioner">
					<Dialog.Content class="dialog__content">
						<div class="dialog__header">
							<Dialog.Title class="dialog__title">Edit Project</Dialog.Title>
						</div>

						<Separator />

						<div class="grid gap-4 py-4">
							<div class="grid gap-4 grid-cols-2">
								<TextField class="text-field">
									<TextField.Label class="text-field__label required">
										Name
									</TextField.Label>
									<TextField.Input
										class="text-field__input"
										placeholder="My Mini App"
										value={form.name}
										onInput={(e) => setForm("name", e.currentTarget.value)}
									/>
								</TextField>

								<TextField class="text-field">
									<TextField.Label class="text-field__label required">
										URL
									</TextField.Label>
									<TextField.Input
										class="text-field__input"
										placeholder="http://127.0.0.1:8080"
										value={form.url}
										onInput={(e) => setForm("url", e.currentTarget.value)}
									/>
								</TextField>
							</div>

							<div>
								<TextField class="text-field">
									<TextField.Label class="text-field__label">
										Bot Token (Optional)
									</TextField.Label>
									<TextField.Input
										class="text-field__input w-full"
										placeholder="123456:ABC-DEF1234"
										value={form.token}
										onInput={(e) => setForm("token", e.currentTarget.value)}
									/>
									<TextField.Description class="text-sm">
										Bot token is used to sign the auth data passed to the bot.
									</TextField.Description>
								</TextField>
							</div>
						</div>

						<Separator />

						<div class="pt-3 flex justify-end gap-4">
							<Dialog.CloseButton>
								<Button>Cancel</Button>
							</Dialog.CloseButton>

							<Button
								class="button"
								disabled={!form.valid}
								onClick={onClickEdit}
							>
								Update
							</Button>
						</div>
					</Dialog.Content>
				</div>
			</Dialog.Portal>
		</Dialog>
	);
};

export default DialogEditProject;
