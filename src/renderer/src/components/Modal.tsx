import { IoClose } from "solid-icons/io";
import "./Modal.scss";

import {
	type JSX,
	onCleanup,
	onMount,
	Show,
	type ParentComponent,
} from "solid-js";

const Modal: ParentComponent<{
	title: string;
	footer?: Element | JSX.Element;
	id?: string;
	closer?: () => void;
	unclosable?: boolean;
}> = (props) => {
	const onClickDismissArea = (e) => {
		if (e.target === e.currentTarget) {
			closeModal();
		}
	};

	const onKeyDown = (e) => {
		if (e.key === "Escape") {
			closeModal();
		}
	};

	const closeModal = () => {
		if (!props.unclosable && props.closer) {
			props.closer();
		}
	};

	onMount(() => {
		document.addEventListener("keydown", onKeyDown);

		onCleanup(() => document.removeEventListener("keydown", onKeyDown));
	});

	return (
		<div
			class="modal-container"
			onClick={onClickDismissArea}
			onKeyUp={onKeyDown}
		>
			<section class="modal" id={props.id}>
				<header>
					<b>{props.title}</b>

					<Show when={!props.unclosable}>
						<IoClose onClick={closeModal} />
					</Show>
				</header>

				<div>{props.children}</div>

				<Show when={props.footer}>
					<footer>{props.footer}</footer>
				</Show>
			</section>
		</div>
	);
};

export default Modal;
