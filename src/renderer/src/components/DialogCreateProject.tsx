import {
	createEffect,
	createSignal,
	type Accessor,
	type Component,
	type Setter,
} from "solid-js";

import validator from "validator";
import { Button } from "@kobalte/core/button";
import { Dialog } from "@kobalte/core/dialog";
import { Separator } from "@kobalte/core/separator";
import { TextField } from "@kobalte/core/text-field";
import { createStore } from "solid-js/store";
import { openProject, projects, setProjects } from "../utils/project";
import ProjectPage from "../pages/Project";
import type { Project } from "../types";

const DialogCreateProject: Component<{
	isOpen: Accessor<boolean>;
	setIsOpen: Setter<boolean>;
}> = (props) => {
	const [createButtonEnabled, setCreateButtonEnabled] = createSignal(false);
	const [form, setForm] = createStore({
		name: "",
		url: "",
		token: "",
	});

	createEffect(() => {
		setCreateButtonEnabled(
			form.name.length > 0 &&
				form.name.length <= 64 &&
				validator.isURL(form.url),
		);
	});

	const onClickCreate = async () => {
		if (!createButtonEnabled()) return;

		const project = {
			id: `${Math.random().toString(36)}00000000000000000`.slice(2, 10),
			name: form.name,
			url: form.url,
			token: form.token,
		};

		const defaultSettings: Project["settings"]["android"] = {
			expanded: false,
			mode: "light",
			open: true,
		};

		setProjects([
			...projects(),
			{
				...project,
				settings: {
					android: defaultSettings,
					ios: defaultSettings,
					tdesktop: defaultSettings,
					web: defaultSettings,
					weba: defaultSettings,
				},
			},
		]);

		props.setIsOpen(false);

		openProject(project.id, () => <ProjectPage id={project.id} />);
	};

	return (
		<Dialog open={props.isOpen()} onOpenChange={() => props.setIsOpen(false)}>
			<Dialog.Portal>
				<Dialog.Overlay class="dialog__overlay" />
				<div class="dialog__positioner">
					<Dialog.Content class="dialog__content">
						<div class="dialog__header">
							<Dialog.Title class="dialog__title">
								Create New Project
							</Dialog.Title>
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
								disabled={!createButtonEnabled()}
								onClick={onClickCreate}
							>
								Create
							</Button>
						</div>
					</Dialog.Content>
				</div>
			</Dialog.Portal>
		</Dialog>
	);
};

export default DialogCreateProject;
