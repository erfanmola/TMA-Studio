import {
	createSignal,
	Show,
	type ParentComponent,
	type Signal,
} from "solid-js";

import { FaSolidPlus, FaSolidMinus } from "solid-icons/fa";

const Accordion: ParentComponent<{
	title: string;
	signalOpen?: Signal<boolean>;
}> = (props) => {
	const [open, setOpen] = props.signalOpen ?? createSignal(false);

	return (
		<div class="accordion" classList={{ open: open() }}>
			<header onClick={() => setOpen(!open())}>
				<Show when={open()} fallback={<FaSolidPlus />}>
					<FaSolidMinus />
				</Show>
				<span>{props.title}</span>
			</header>

			<Show when={open()}>
				<section>{props.children}</section>
			</Show>
		</div>
	);
};

export default Accordion;
