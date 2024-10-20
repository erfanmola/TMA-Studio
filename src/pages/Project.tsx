import "./Project.scss";

import { AndroidFrame, IPhoneFrame } from "../components/DeviceFrames";

import type { Component } from "solid-js";
import { GridPattern } from "../components/GridPattern";
import type { Project } from "../types";

const ViewportIOS: Component = (props) => {
	return (
		<IPhoneFrame>
			<div>Data</div>
		</IPhoneFrame>
	);
};

const ViewportAndroid: Component = (props) => {
	return (
		<AndroidFrame>
			<div>Data</div>
		</AndroidFrame>
	);
};

const ProjectPage: Component<{ id: Project["id"] }> = (props) => {
	return (
		<div id="container-page-project">
			<GridPattern
				width={32}
				height={32}
				x={-1}
				y={-1}
				strokeDasharray={"4 2"}
			/>

			<div>
				<ViewportIOS />

				<ViewportAndroid />
			</div>
		</div>
	);
};

export default ProjectPage;
