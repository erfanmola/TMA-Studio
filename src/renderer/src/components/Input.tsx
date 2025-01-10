import "./Input.scss";

import { createUniqueId, type JSX, type Component, Show } from "solid-js";

const Input: Component<{
	label: string;
	placeholder?: string;
	value: string;
	onInput: JSX.InputEventHandlerUnion<HTMLInputElement, InputEvent>;
	required?: boolean;
	type?: string;
	valid?: undefined | null | boolean;
	description?: string;
	disabled?: boolean;
}> = (props) => {
	const inputId = createUniqueId();

	return (
		<div
			class={[
				"input",
				props.required ? "required" : "",
				props.disabled ? "disabled" : "",
				typeof props.valid === "undefined" || props.valid === null
					? ""
					: props.valid
						? "valid"
						: "invalid",
			].join(" ")}
		>
			<label for={inputId}>{props.label}</label>

			<input
				id={inputId}
				placeholder={props.placeholder}
				value={props.value}
				onInput={props.onInput}
				type={props.type ?? "text"}
				disabled={props.disabled}
			/>

			<Show when={props.description}>
				<span>{props.description}</span>
			</Show>
		</div>
	);
};

export default Input;
