import "./Header.scss";

import { Show, onMount } from "solid-js";

import { FiBox } from "solid-icons/fi";
import GHButton from "./GHButton";
import { createSignal } from "solid-js";
import { fetch } from "@tauri-apps/plugin-http";

const [ghStars, setGHStars] = createSignal(0);
const ghRepoURL = "https://github.com/erfanmola/TMA-Studio";

const Header = () => {
	onMount(async () => {
		if (ghStars() === 0) {
			try {
				const request = await fetch(
					ghRepoURL.replace("github.com/", "api.github.com/repos/"),
				);
				const result = await request.json();

				if (result && "stargazers_count" in result) {
					setGHStars(result.stargazers_count);
				}
			} catch (e) {}
		}
	});

	return (
		<header id="header-main">
			<div>
				<FiBox />

				<Show when={ghStars() > 0}>
					<GHButton stars={ghStars()} url={ghRepoURL} />
				</Show>
			</div>
		</header>
	);
};

export default Header;
