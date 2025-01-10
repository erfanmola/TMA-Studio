import { batch, createEffect, on, type Component } from "solid-js";

import { preferences, setPreferences } from "@renderer/utils/preferences";
import type { UserContextMenuStore } from "./Header";
import type { SetStoreFunction } from "solid-js/store";
import Modal from "./Modal";

const DialogRemoveUser: Component<{
	UserContextMenuStore: [
		get: UserContextMenuStore,
		set: SetStoreFunction<UserContextMenuStore>,
	];
}> = (props) => {
	const [contextMenuStore, setContextMenuStore] = props.UserContextMenuStore;

	createEffect(
		on(
			() => contextMenuStore.delete.open,
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
		batch(() => {
			setPreferences("users", {
				active: "none",
				users: preferences.users.users.filter(
					(item) =>
						item.id !== Number.parseInt(contextMenuStore.delete.id ?? ""),
				),
			});
			setContextMenuStore("delete", "open", false);
		});
	};

	return (
		<Modal
			title="Delete User"
			closer={() => setContextMenuStore("delete", "open", false)}
			footer={
				<div class="grid grid-cols-2 flex-grow gap-2">
					<button
						type="button"
						class="button-secondary"
						style={{ padding: "0.625rem" }}
						onClick={() => setContextMenuStore("delete", "open", false)}
					>
						Cancel
					</button>

					<button
						type="button"
						class="button-danger"
						style={{ padding: "0.625rem" }}
						onClick={onClickDelete}
					>
						Delete User
					</button>
				</div>
			}
		>
			<div class="grid gap-5 py-1">
				<p style={{ "text-align": "initial" }}>
					Are you sure of deleting the{" "}
					<b>
						{
							preferences.users.users.find(
								(item) =>
									item.id === Number.parseInt(contextMenuStore.delete.id ?? ""),
							)?.first_name
						}
					</b>{" "}
					user?
				</p>
			</div>
		</Modal>
	);
};

export default DialogRemoveUser;
