import { createMemo, type Component } from "solid-js";

import { createStore } from "solid-js/store";
import { openProject } from "../utils/project";
import ProjectPage from "../pages/Project";
import type { Project } from "../types";
import {
	preferences,
	setModals,
	setPreferences,
} from "@renderer/utils/preferences";
import Modal from "./Modal";
import Input from "./Input";
import { isValidURL } from "@renderer/utils/general";
import type { TelegramPlatform } from "@renderer/utils/themes";
import Alert from "./Alert";

const DialogCreateProject: Component = () => {
	const [form, setForm] = createStore({
		name: "",
		url: "",
		token: "",
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

	const onClickCreate = async () => {
		if (!valid()) return;

		const project = {
			id: `${Math.random().toString(36)}00000000000000000`.slice(2, 10),
			name: form.name,
			url: form.url,
			token: form.token,
		};

		const defaultSettings: Project["settings"][TelegramPlatform] = {
			expanded: false,
			mode: "light",
			open: true,
			floating: false,
		};

		setPreferences("projects", [
			...preferences.projects,
			{
				...project,
				settings: {
					android: defaultSettings,
					ios: defaultSettings,
					tdesktop: defaultSettings,
					web: defaultSettings,
					weba: defaultSettings,
					macos: defaultSettings,
				},
			},
		]);

		setModals("project", "new", "open", false);

		openProject(project.id, () => <ProjectPage id={project.id} />);
	};

	return (
		<Modal
			title="New Project"
			closer={() => setModals("project", "new", "open", false)}
			footer={
				<button
					type="button"
					class="button-primary flex-grow"
					style={{ padding: "0.625rem" }}
					disabled={!valid()}
					onClick={onClickCreate}
				>
					Create Project
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

			<Alert type="info" style={{ width: "30rem", "margin-top": "0.5rem" }}>
				<p
					style={{
						"line-height": "2",
						"font-size": "0.925rem",
						"text-align": "justify",
					}}
				>
					User{" "}
					<b>
						{preferences.users.users.find(
							(item) => item.id === preferences.users.active,
						)?.first_name ?? "Guest"}
					</b>{" "}
					will be used for this project. You can{" "}
					<span
						onClick={() => setModals("user", "new", "open", true)}
						style={{
							cursor: "pointer",
							"border-bottom": "0.125rem dotted currentColor",
							"padding-bottom": "0.125rem",
						}}
					>
						create new user
					</span>{" "}
					and seamlessly switch between them in real-time.
				</p>
			</Alert>
		</Modal>
	);
};

export default DialogCreateProject;
