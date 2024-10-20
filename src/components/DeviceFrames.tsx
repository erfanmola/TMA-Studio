import "./DeviceFrames.scss";

import type { ParentComponent } from "solid-js";

export const IPhoneFrame: ParentComponent = (props) => {
	return (
		<div id="frame-iphone">
			<div>{props.children}</div>
		</div>
	);
};

export const AndroidFrame: ParentComponent = (props) => {
	return (
		<div id="frame-android">
			<div>{props.children}</div>
		</div>
	);
};
