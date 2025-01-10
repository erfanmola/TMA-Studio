import "./Select.scss";
import {
	type CreateSelectOption,
	type CreateSelectValue,
	Select as SelectBox,
} from "@thisbeyond/solid-select";
import "@thisbeyond/solid-select/style.css";

import {
	createUniqueId,
	type Component,
	Show,
	type JSXElement,
} from "solid-js";

const Select: Component<{
	label: string;
	placeholder?: string;
	value: string;
	options: any[] | ((inputValue: string) => CreateSelectOption[]);
	format?: (
		data: CreateSelectOption | CreateSelectValue,
		type: "option" | "value",
	) => JSXElement | undefined;
	required?: boolean;
	description?: string;
	disabled?: boolean;
	valid?: undefined | null | boolean;
	onChange?: (value: CreateSelectValue) => void;
}> = (props) => {
	const inputId = createUniqueId();

	return (
		<div
			class={[
				"select",
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

			<SelectBox
				class="selectbox"
				options={props.options}
				placeholder={props.placeholder}
				initialValue={props.value}
				disabled={props.disabled}
				onChange={props.onChange}
				format={props.format}
				isOptionDisabled={(option: string) => option === props.value}
			/>

			<Show when={props.description}>
				<span>{props.description}</span>
			</Show>
		</div>
	);
};

export default Select;
