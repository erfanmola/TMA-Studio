import "./Switch.scss";

import { type Component, Show } from "solid-js";

const Switch: Component<{
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
	required?: boolean;
	disabled?: boolean;
}> = (props) => {
	return (
		<div
			class={[
				"switch",
				props.required ? "required" : "",
				props.disabled ? "disabled" : "",
			].join(" ")}
			onClick={() => props.onChange(!props.checked)}
		>
			<Show when={props.label}>
				<span>{props.label}</span>
			</Show>
			<input type="checkbox" checked={props.checked} />
			<div />
		</div>
	);
};

export default Switch;
