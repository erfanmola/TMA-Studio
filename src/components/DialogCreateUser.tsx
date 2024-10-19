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
import { useSettings } from "../contexts/SettingsContext";
import { Checkbox } from "@kobalte/core/checkbox";
import { BsCheckLg } from "solid-icons/bs";
import { Combobox } from "@kobalte/core/combobox";
import { ietfLanguages } from "../utils/ietf";
import { FiGlobe } from "solid-icons/fi";
import { setUsers, users } from "../utils/user";
import type { User } from "../types";

const DialogAddUser: Component<{
	isOpen: Accessor<boolean>;
	setIsOpen: Setter<boolean>;
}> = (props) => {
	const { settings } = useSettings();

	const [addButtonEnabled, setAddButtonEnabled] = createSignal(false);
	const [form, setForm] = createStore({
		id: "",
		first_name: "",
		last_name: "",
		username: "",
		photo_url: "",
		language_code: "en",
		is_premium: false,
		allows_write_to_pm: false,
	});

	createEffect(() => {
		setAddButtonEnabled(
			form.first_name.length > 0 &&
				validator.isNumeric(form.id) &&
				(form.photo_url.length === 0 || validator.isURL(form.photo_url)),
		);
	});

	const onClickAdd = async () => {
		if (!addButtonEnabled()) return;

		const user: User = {
			id: form.id,
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

		setUsers([...users(), user]);

		await settings?.set("users", users());
		await settings?.save();

		props.setIsOpen(false);
	};

	return (
		<Dialog open={props.isOpen()} onOpenChange={() => props.setIsOpen(false)}>
			<Dialog.Portal>
				<Dialog.Overlay class="dialog__overlay" />
				<div class="dialog__positioner">
					<Dialog.Content class="dialog__content">
						<div class="dialog__header">
							<Dialog.Title class="dialog__title">Add User</Dialog.Title>
						</div>

						<Separator />

						<div class="grid gap-4 py-4">
							<div class="grid gap-4 grid-cols-2">
								<TextField class="text-field">
									<TextField.Label class="text-field__label required">
										First Name
									</TextField.Label>
									<TextField.Input
										class="text-field__input"
										placeholder="John"
										value={form.first_name}
										onInput={(e) =>
											setForm("first_name", e.currentTarget.value)
										}
									/>
								</TextField>

								<TextField class="text-field">
									<TextField.Label class="text-field__label">
										Last Name
									</TextField.Label>
									<TextField.Input
										class="text-field__input"
										placeholder="Doe"
										value={form.last_name}
										onInput={(e) => setForm("last_name", e.currentTarget.value)}
									/>
								</TextField>
							</div>

							<div class="grid gap-4 grid-cols-2">
								<TextField class="text-field">
									<TextField.Label class="text-field__label required">
										User ID
									</TextField.Label>
									<TextField.Input
										class="text-field__input"
										placeholder="1234567890"
										value={form.id}
										onInput={(e) => setForm("id", e.currentTarget.value)}
									/>
								</TextField>

								<TextField class="text-field">
									<TextField.Label class="text-field__label">
										Username
									</TextField.Label>
									<TextField.Input
										class="text-field__input"
										placeholder="John_Doe"
										value={form.username}
										onInput={(e) => setForm("username", e.currentTarget.value)}
									/>
								</TextField>
							</div>

							<div class="grid gap-4 grid-cols-2">
								<TextField class="text-field">
									<TextField.Label class="text-field__label">
										Photo URL
									</TextField.Label>
									<TextField.Input
										class="text-field__input"
										placeholder="https://placehold.co/600x400"
										value={form.photo_url}
										onInput={(e) => setForm("photo_url", e.currentTarget.value)}
									/>
								</TextField>

								<Combobox
									options={ietfLanguages}
									defaultValue={form.language_code}
									onChange={(value) =>
										setForm("language_code", value as string)
									}
									placeholder="Language"
									itemComponent={(props) => (
										<Combobox.Item item={props.item} class="combobox__item">
											<Combobox.ItemLabel>
												{props.item.rawValue}
											</Combobox.ItemLabel>
											<Combobox.ItemIndicator class="combobox__item-indicator">
												<BsCheckLg />
											</Combobox.ItemIndicator>
										</Combobox.Item>
									)}
								>
									<Combobox.Label class="text-field__label block">
										Language Code
									</Combobox.Label>
									<Combobox.Control class="combobox__control">
										<Combobox.Input class="combobox__input" />
										<Combobox.Trigger class="combobox__trigger">
											<Combobox.Icon class="combobox__icon">
												<FiGlobe />
											</Combobox.Icon>
										</Combobox.Trigger>
									</Combobox.Control>
									<Combobox.Portal>
										<Combobox.Content class="combobox__content z-50">
											<Combobox.Listbox class="combobox__listbox" />
										</Combobox.Content>
									</Combobox.Portal>
								</Combobox>
							</div>

							<div class="grid gap-4 grid-cols-2">
								<Checkbox
									class="checkbox"
									checked={form.is_premium}
									onChange={(checked) => setForm("is_premium", checked)}
								>
									<Checkbox.Input class="checkbox__input" />
									<Checkbox.Control class="checkbox__control">
										<Checkbox.Indicator>
											<BsCheckLg />
										</Checkbox.Indicator>
									</Checkbox.Control>
									<Checkbox.Label class="checkbox__label">
										Premium
									</Checkbox.Label>
								</Checkbox>

								<Checkbox
									class="checkbox"
									checked={form.allows_write_to_pm}
									onChange={(checked) => setForm("allows_write_to_pm", checked)}
								>
									<Checkbox.Input class="checkbox__input" />
									<Checkbox.Control class="checkbox__control">
										<Checkbox.Indicator>
											<BsCheckLg />
										</Checkbox.Indicator>
									</Checkbox.Control>
									<Checkbox.Label class="checkbox__label">
										Allows write to pm
									</Checkbox.Label>
								</Checkbox>
							</div>
						</div>

						<Separator />

						<div class="pt-3 flex justify-end gap-4">
							<Dialog.CloseButton>
								<Button>Cancel</Button>
							</Dialog.CloseButton>

							<Button
								class="button"
								disabled={!addButtonEnabled()}
								onClick={onClickAdd}
							>
								Add
							</Button>
						</div>
					</Dialog.Content>
				</div>
			</Dialog.Portal>
		</Dialog>
	);
};

export default DialogAddUser;
