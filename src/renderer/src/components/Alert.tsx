import "./Alert.scss";

import type { JSX, ParentComponent } from "solid-js";

type AlertType =
	| "primary"
	| "secondary"
	| "success"
	| "danger"
	| "warning"
	| "info"
	| "light"
	| "dark";

const Alert: ParentComponent<{
	type: AlertType;
	style?: JSX.CSSProperties;
}> = (props) => {
	return (
		<div class={["alert", `alert-${props.type}`].join(" ")} style={props.style}>
			{props.children}
		</div>
	);
};

export default Alert;
