import "./DeviceFrames.scss";

import type { ParentComponent } from "solid-js";

export const FrameIPhone: ParentComponent<{
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

export const FrameAndroid: ParentComponent<{
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

export const FrameDesktop: ParentComponent<{
	classList?: {
		[k: string]: boolean | undefined;
	};
}> = (props) => {
	return (
		<div id="frame-tdesktop" classList={props.classList}>
			<div>{props.children}</div>
		</div>
	);
};

export const FrameMacOS: ParentComponent<{
	classList?: {
		[k: string]: boolean | undefined;
	};
}> = (props) => {
	return (
		<div id="frame-macos" classList={props.classList}>
			<div>{props.children}</div>
		</div>
	);
};

export const FrameWeb: ParentComponent<{
	classList?: {
		[k: string]: boolean | undefined;
	};
}> = (props) => {
	return (
		<div id="frame-web" classList={props.classList}>
			<div>{props.children}</div>
		</div>
	);
};

export const FrameWebA: ParentComponent<{
	classList?: {
		[k: string]: boolean | undefined;
	};
}> = (props) => {
	return (
		<div id="frame-weba" classList={props.classList}>
			<div>{props.children}</div>
		</div>
	);
};
