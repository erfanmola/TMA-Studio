import "./Toggle.scss";

import type { Component, JSX } from "solid-js";

const Toggle: Component<{
	checked: boolean;
	onChange: (checked: boolean) => void;
	children: (checked: boolean) => JSX.Element;
	style?: { [key: string]: string };
	title?: string;
}> = (props) => {
	return (
		<div
			class={`toggle ${props.checked ? "checked" : ""}`}
			onClick={() => props.onChange(!props.checked)}
			title={props.title}
			style={props.style}
		>
			{props.children?.(props.checked)}
		</div>
	);
};

export default Toggle;
