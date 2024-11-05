import "./DeviceFrames.scss";

import type { ParentComponent } from "solid-js";

export const IPhoneFrame: ParentComponent<{
	classList?: {
		[k: string]: boolean | undefined;
	};
}> = (props) => {
	return (
		<div id="frame-iphone" classList={props.classList}>
			<div>{props.children}</div>
		</div>
	);
};

export const AndroidFrame: ParentComponent<{
	classList?: {
		[k: string]: boolean | undefined;
	};
}> = (props) => {
	return (
		<div id="frame-android" classList={props.classList}>
			<div>{props.children}</div>
		</div>
	);
};
