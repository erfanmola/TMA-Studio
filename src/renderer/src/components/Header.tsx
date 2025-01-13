import "./Header.scss";

import { FaRegularUser, FaSolidCheck } from "solid-icons/fa";
import { FiMoon, FiSun } from "solid-icons/fi";
import { Menu, MenuItem } from "@electron-uikit/contextmenu/renderer";
import { Select, createOptions } from "@thisbeyond/solid-select";
import { Show, createSignal } from "solid-js";
import { preferences, setPreferences } from "@renderer/utils/preferences";

import DialogRemoveUser from "./DialogRemoveUser";
import GHButton from "./GHButton";
import type { HTMLTitleBarElementAttributes } from "@electron-uikit/titlebar/renderer";
import { TbDeviceMobileCode } from "solid-icons/tb";
import { createStore } from "solid-js/store";
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
export type UserContextMenuStore = {
	delete: {
		id: undefined | string;
		open: boolean;
	};
	edit: {
		id: undefined | string;
		open: boolean;
	};
};

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

	const [contextMenuStore, setContextMenuStore] =
		createStore<UserContextMenuStore>({
			delete: {
				id: undefined,
				open: false,
			},
			edit: {
				id: undefined,
				open: false,
			},
		});

	const onContextMenu = (userId) => {
		const menu = new Menu();

		menu.append(
			new MenuItem({
				type: "normal",
				label: "Delete User",
				click: () => {
					setContextMenuStore("delete", {
						id: userId,
						open: true,
					});
				},
			}),
		);

		menu.popup();
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
						class="selectbox"
						{...createOptions(
							[
								{
									value: "none",
									label: "Guest",
								},
								...preferences.users.users.map((user) => ({
									value: user.id,
									label: `${user.first_name} ${user.last_name ?? ""}`,
								})),
							],
							{
								format: (item) => (
									<div
										class="flex items-center selectbox-item"
										classList={{
											active: item.value === preferences.users.active,
										}}
										onContextMenu={(e) => {
											e.preventDefault();
											if (item.value === "none") return;
											onContextMenu(item.value);
										}}
									>
										<span style={{ "flex-grow": "1" }}>{item.label}</span>
										<Show when={item.value === preferences.users.active}>
											<FaSolidCheck />
										</Show>
									</div>
								),
								filterable: false,
								disable: (item) => item.value === preferences.users.active,
							},
						)}
						initialValue={{
							value: preferences.users.active,
							label:
								preferences.users.users.find(
									(item) => item.id === preferences.users.active,
								)?.first_name ?? "Guest",
						}}
						format={(item, type) =>
							type === "value" ? (
								<div class="flex items-center">
									<span class="flex-grow">{item.label}</span>
									<FaRegularUser />
								</div>
							) : (
								item.label
							)
						}
						onChange={(item) => setPreferences("users", "active", item.value)}
						readonly={true}
					/>
				</div>

				<Show when={contextMenuStore.delete.open && contextMenuStore.delete.id}>
					<DialogRemoveUser
						UserContextMenuStore={[contextMenuStore, setContextMenuStore]}
					/>
				</Show>
			</header>
		</>
	);
};

export default Header;
