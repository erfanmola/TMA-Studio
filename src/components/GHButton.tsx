import "./GHButton.scss";

import { BsGithub } from "solid-icons/bs";
import type { Component } from "solid-js";

const GHButton: Component<{
	stars: number;
	url: string;
}> = (props) => {
	return (
		<a href={props.url} target="_blank" class="gh-button" rel="noreferrer">
			<span>
				<BsGithub />
				Star
			</span>

			<span>{props.stars.toLocaleString()}</span>
		</a>
	);
};

export default GHButton;
