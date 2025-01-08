import { batch, createEffect, on, type Component } from "solid-js";

import { Button } from "@kobalte/core/button";
import { Dialog } from "@kobalte/core/dialog";
import { Separator } from "@kobalte/core/separator";
import { preferences, setPreferences } from "@renderer/utils/preferences";
import type { UserContextMenuStore } from "./Header";
import type { SetStoreFunction } from "solid-js/store";

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
		<Dialog
			open={contextMenuStore.delete.open}
			onOpenChange={() => setContextMenuStore("delete", "open", false)}
		>
			<Dialog.Portal>
				<Dialog.Overlay class="dialog__overlay" />
				<div class="dialog__positioner">
					<Dialog.Content class="dialog__content">
						<div class="dialog__header">
							<Dialog.Title class="dialog__title">Delete User</Dialog.Title>
						</div>

						<Separator />

						<div class="grid gap-4 py-4">
							<p>
								Are you sure of deleting the{" "}
								<b>
									{
										preferences.users.users.find(
											(item) =>
												item.id ===
												Number.parseInt(contextMenuStore.delete.id ?? ""),
										)?.first_name
									}
								</b>{" "}
								user?
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

export default DialogRemoveUser;
