import type { Component } from "solid-js";
import type { Project } from "../types";

const ProjectPage: Component<{ id: Project["id"] }> = (props) => {
	return <h1>{props.id}</h1>;
};

export default ProjectPage;
