import {
	batch,
	createEffect,
	on,
	type Accessor,
	type Component,
	type Setter,
} from "solid-js";

import { Button } from "@kobalte/core/button";
import { Dialog } from "@kobalte/core/dialog";
import { Separator } from "@kobalte/core/separator";
import { users, setUsers, setActiveUserId } from "@renderer/utils/user";

const DialogRemoveUser: Component<{
	isOpen: Accessor<boolean>;
	setIsOpen: Setter<boolean>;
	userId: Accessor<number | undefined>;
	setUserId: Setter<number | undefined>;
}> = (props) => {
	createEffect(
		on(
			props.isOpen,
			() => {
				if (!props.isOpen()) {
					props.setUserId(undefined);
				}
			},
			{
				defer: true,
			},
		),
	);

	const onClickDelete = async () => {
		batch(() => {
			setActiveUserId("none");
			setUsers(users().filter((item) => item.id !== props.userId()));
			props.setIsOpen(false);
		});
	};

	return (
		<Dialog open={props.isOpen()} onOpenChange={() => props.setIsOpen(false)}>
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
										users().find((item) => item.id === props.userId())
											?.first_name
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
