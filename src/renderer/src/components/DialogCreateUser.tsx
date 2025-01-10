import { createMemo, type Component } from "solid-js";

import { createStore, produce } from "solid-js/store";
import { ietfLanguages } from "../utils/ietf";
import type { User } from "../types";
import {
	preferences,
	setModals,
	setPreferences,
} from "@renderer/utils/preferences";
import Modal from "./Modal";
import Input from "./Input";
import Select from "./Select";
import Checkbox from "./Checkbox";
import { isValidURL } from "@renderer/utils/general";
import validator from "validator";
import { FiGlobe } from "solid-icons/fi";
import { toast } from "@electron-uikit/toast/renderer";

const DialogAddUser: Component = () => {
	const [form, setForm] = createStore({
		id: "",
		first_name: "",
		last_name: "",
		username: "",
		photo_url: "",
		language_code: "en",
		is_premium: false,
		allows_write_to_pm: true,
	});

	const validation = createMemo(() => ({
		id: validator.isNumeric(form.id),
		first_name: form.first_name.length > 0 && form.first_name.length < 64,
		last_name: form.last_name.length > 0 && form.last_name.length < 64,
		username: /^[a-zA-Z](?:[a-zA-Z0-9_]{3,31})$/.test(form.username),
		photo_url: isValidURL(form.photo_url),
		language_code: ietfLanguages.includes(form.language_code),
	}));

	const valid = createMemo(() => {
		if (validation().id && validation().first_name) {
			for (const key in form) {
				if (
					form[key].toString().length > 0 &&
					key in validation() &&
					!validation()[key]
				) {
					return false;
				}
			}
			return true;
		}

		return false;
	});

	const onClickCreate = async () => {
		if (!valid()) return;

		if (
			preferences.users.users.find(
				(item) => item.id === Number.parseInt(form.id),
			)
		)
			return toast.text("User with given id already exists.");

		const user: User = {
			id: Number.parseInt(form.id),
			first_name: form.first_name,
		};

		for (const key in form) {
			if (
				typeof form[key as keyof typeof form] === "string" &&
				form[key as keyof typeof form].toString().length > 0
			) {
				// @ts-ignore
				user[key as keyof User] = form[key as keyof typeof form] as string;
			} else if (
				typeof form[key as keyof typeof form] === "boolean" &&
				form[key as keyof typeof form]
			) {
				// @ts-ignore
				user[key as keyof User] = true;
			}
		}

		user.id = Number.parseInt(user.id.toString());

		setPreferences(
			produce((store) => {
				store.users.users.push(user);
				store.users.active = user.id;
			}),
		);

		setModals("user", "new", "open", false);
	};

	return (
		<Modal
			title="New User"
			closer={() => setModals("user", "new", "open", false)}
			footer={
				<button
					type="button"
					class="button-primary flex-grow"
					style={{ padding: "0.625rem" }}
					disabled={!valid()}
					onClick={onClickCreate}
				>
					Create User
				</button>
			}
		>
			<div class="grid gap-5 py-1">
				<div class="grid gap-5 grid-cols-2">
					<Input
						label="First Name"
						placeholder="John"
						value={form.first_name}
						required
						onInput={(e) => setForm("first_name", e.currentTarget.value.trim())}
						valid={validation().first_name}
					/>

					<Input
						label="Last Name"
						placeholder="Doe"
						value={form.last_name}
						onInput={(e) => setForm("last_name", e.currentTarget.value.trim())}
						valid={validation().last_name}
					/>
				</div>

				<div class="grid gap-5 grid-cols-2">
					<Input
						label="User ID"
						placeholder="1234567890"
						value={form.id}
						required
						onInput={(e) => setForm("id", e.currentTarget.value.trim())}
						valid={validation().id}
					/>

					<Input
						label="Username"
						placeholder="John_Doe"
						value={form.username}
						onInput={(e) => setForm("username", e.currentTarget.value.trim())}
						valid={validation().username}
					/>
				</div>

				<div class="grid gap-5 grid-cols-2">
					<Input
						label="Photo URL"
						placeholder="https://picsum.photos/256/256"
						value={form.photo_url}
						onInput={(e) => setForm("photo_url", e.currentTarget.value.trim())}
						valid={validation().photo_url}
					/>

					<Select
						label="Language Code"
						placeholder="en"
						value={form.language_code}
						options={ietfLanguages}
						valid={validation().language_code}
						onChange={(value) => {
							setForm("language_code", value);
						}}
						format={(item, type) =>
							type === "value" ? (
								<div class="flex items-center">
									<span class="flex-grow">{item}</span>
									<FiGlobe />
								</div>
							) : (
								item
							)
						}
					/>
				</div>

				<div class="grid gap-5 grid-cols-2">
					<Checkbox
						label="Premium"
						checked={form.is_premium}
						onChange={(checked) => setForm("is_premium", checked)}
					/>

					<Checkbox
						label="Allow write to pm"
						checked={form.allows_write_to_pm}
						onChange={(checked) => setForm("allows_write_to_pm", checked)}
					/>
				</div>
			</div>
		</Modal>
	);
};

export default DialogAddUser;
