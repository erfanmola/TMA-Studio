import { BsCheckSquareFill, BsSquareFill } from "solid-icons/bs";
import "./Checkbox.scss";

import { type Component, Show } from "solid-js";

const Checkbox: Component<{
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
	required?: boolean;
	disabled?: boolean;
}> = (props) => {
	return (
		<div
			class={[
				"checkbox",
				props.required ? "required" : "",
				props.disabled ? "disabled" : "",
			].join(" ")}
			onClick={() => props.onChange(!props.checked)}
		>
			<Show when={props.checked} fallback={<BsSquareFill class="empty" />}>
				<BsCheckSquareFill class="checked" />
			</Show>
			<Show when={props.label}>
				<span>{props.label}</span>
			</Show>
		</div>
	);
};

export default Checkbox;
