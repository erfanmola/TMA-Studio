import "./GHButton.scss";

import { BsGithub } from "solid-icons/bs";
import { type Component, Show } from "solid-js";

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

			<Show when={props.stars > 0}>
				<span>{props.stars.toLocaleString()}</span>
			</Show>
		</a>
	);
};

export default GHButton;
