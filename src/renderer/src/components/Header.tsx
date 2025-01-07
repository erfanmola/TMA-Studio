import "./Header.scss";

import { FiMoon, FiSun } from "solid-icons/fi";
import { Item, Menu, useContextMenu } from "solid-contextmenu";
import { Show, batch, createSignal } from "solid-js";
import { activeUserId, setActiveUserId, users } from "../utils/user";
import { preferences, setPreferences } from "@renderer/utils/preferences";

import { AiOutlineUser } from "solid-icons/ai";
import { BsCheckLg } from "solid-icons/bs";
import DialogRemoveUser from "./DialogRemoveUser";
import GHButton from "./GHButton";
import type { HTMLTitleBarElementAttributes } from "@electron-uikit/titlebar/renderer";
import { Select } from "@kobalte/core/select";
import { TbDeviceMobileCode } from "solid-icons/tb";
import { onMount } from "solid-js";

const [ghStars, setGHStars] = createSignal(0);
export const ghRepoURL = "https://github.com/erfanmola/TMA-Studio";

declare module "solid-js" {
	namespace JSX {
		interface IntrinsicElements {
			"title-bar": Partial<HTMLTitleBarElementAttributes>;
		}
	}
}

const Header = () => {
	onMount(async () => {
		if (ghStars() === 0) {
			try {
				const request = await fetch(
					ghRepoURL.replace("github.com/", "api.github.com/repos/"),
				);
				const result = await request.json();

				if (result && "stargazers_count" in result) {
					setGHStars(result.stargazers_count);
				}
			} catch (e) {}
		}
	});

	const [dialogDeleteUser, setDialogDeleteUser] = createSignal<boolean>(false);
	const [deleteUserID, setDeleteUserID] = createSignal<number | undefined>(
		undefined,
	);

	const onClickMenuUserDelete = (e: any) => {
		batch(() => {
			setDeleteUserID(e.props);
			setDialogDeleteUser(true);
		});
	};

	return (
		<>
			{/* @ts-ignore */}
			<title-bar
				windowtitle="TMA Studio"
				noclose="true"
				nomaximize="true"
				nominimize="true"
			>
				<div
					id="control"
					class="window__control"
					style={{ cursor: "pointer" }}
					onClick={() =>
						setPreferences(
							"theme_mode",
							preferences.theme_mode === "dark" ? "light" : "dark",
						)
					}
				>
					<Show when={preferences.theme_mode === "light"} fallback={<FiMoon />}>
						<FiSun />
					</Show>
				</div>
			</title-bar>

			<header id="header-main">
				<div>
					<TbDeviceMobileCode />
					<GHButton stars={ghStars()} url={ghRepoURL} />
				</div>

				<div>
					<Select
						options={[
							{
								value: "none",
								label: "Guest",
							},
							...users().map((user) => ({
								value: user.id,
								label: user.first_name,
							})),
						]}
						value={{
							label:
								users().find((item) => item.id === activeUserId())
									?.first_name ?? "Guest",
							value: activeUserId(),
						}}
						onChange={(e) => setActiveUserId(e?.value ?? "none")}
						placeholder="Select User"
						optionValue="value"
						itemComponent={(props) => (
							<Select.Item
								item={props.item}
								class="select__item"
								onContextMenu={(e) => {
									if (props.item.rawValue.value === "none") return;
									useContextMenu({ id: "menu-user" }).show(e, {
										props: props.item.rawValue.value,
									});
								}}
							>
								<Select.ItemLabel>{props.item.rawValue.label}</Select.ItemLabel>
								<Select.ItemIndicator class="select__item-indicator">
									<BsCheckLg />
								</Select.ItemIndicator>
							</Select.Item>
						)}
					>
						<Select.Trigger class="select__trigger">
							<Select.Value class="select__value">
								{/* @ts-ignore */}
								{(state) => state.selectedOption().label}
							</Select.Value>
							<Select.Icon class="select__icon">
								<AiOutlineUser />
							</Select.Icon>
						</Select.Trigger>
						<Select.Portal>
							<Select.Content class="select__content">
								<Select.Listbox class="select__listbox" />
							</Select.Content>
						</Select.Portal>
					</Select>
				</div>

				<Menu id={"menu-user"} animation="scale" theme={preferences.theme_mode}>
					<Item onClick={onClickMenuUserDelete}>Delete User</Item>
				</Menu>

				<Show when={deleteUserID()}>
					<DialogRemoveUser
						isOpen={dialogDeleteUser}
						setIsOpen={setDialogDeleteUser}
						userId={deleteUserID}
						setUserId={setDeleteUserID}
					/>
				</Show>
			</header>
		</>
	);
};

export default Header;
