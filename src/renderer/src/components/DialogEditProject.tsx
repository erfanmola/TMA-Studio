import { createEffect, createMemo, on, type Component } from "solid-js";

import { closeTab } from "./Tabbar";
import type { ProjectContextMenuStore } from "@renderer/pages/Projects";
import { createStore, type SetStoreFunction } from "solid-js/store";
import { deserializeObject, isValidURL } from "@renderer/utils/general";
import { preferences, setPreferences } from "@renderer/utils/preferences";
import Modal from "./Modal";
import Input from "./Input";

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

	const project = preferences.projects.find(
		(item) => item.id === contextMenuStore.edit.id,
	);

	if (!project) return;

	const [form, setForm] = createStore({
		name: project.name,
		url: project.url,
		token: project.token ?? "",
		valid: false,
	});

	const validation = createMemo(() => ({
		name: form.name.length > 0 && form.name.length < 64,
		url: isValidURL(form.url),
		token: /^\d{9,16}:[A-Za-z0-9_-]{32,}$/.test(form.token),
	}));

	const valid = createMemo(() => {
		if (validation().name && validation().url) {
			if (form.token.length === 0) {
				return true;
			}

			return validation().token;
		}

		return false;
	});

	const onClickEdit = async () => {
		if (!valid()) return;

		closeTab(`project-${contextMenuStore.edit.id}`);

		const projectsList = deserializeObject(preferences.projects);
		const project = projectsList.find(
			(item) => item.id === contextMenuStore.edit.id,
		);

		if (!project) return;

		project.name = form.name;
		project.url = form.url;
		project.token = form.token;

		setPreferences("projects", projectsList);
		setContextMenuStore("edit", "open", false);
	};

	return (
		<Modal
			title="Edit Project"
			closer={() => setContextMenuStore("edit", "open", false)}
			footer={
				<button
					type="button"
					class="button-primary flex-grow"
					style={{ padding: "0.625rem" }}
					disabled={!valid()}
					onClick={onClickEdit}
				>
					Update Project
				</button>
			}
		>
			<div class="grid gap-5 py-1">
				<div class="grid gap-5 grid-cols-2">
					<Input
						label="Name"
						placeholder="My Mini App"
						value={form.name}
						required
						onInput={(e) => setForm("name", e.currentTarget.value.trim())}
						valid={validation().name}
					/>

					<Input
						label="URL"
						placeholder="http://localhost:8080"
						value={form.url}
						required
						onInput={(e) => setForm("url", e.currentTarget.value.trim())}
						valid={validation().url}
					/>
				</div>

				<div>
					<Input
						label="Bot Token (optional)"
						placeholder="123456:ABC-DEF1234"
						value={form.token}
						onInput={(e) => setForm("token", e.currentTarget.value.trim())}
						description="Bot token is used to sign the auth data passed to the bot."
						valid={validation().token}
					/>
				</div>
			</div>
		</Modal>
	);
};

export default DialogEditProject;
