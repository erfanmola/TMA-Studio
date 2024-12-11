import "./Header.scss";
import {
	createEffect,
	createSignal,
	on,
	onMount,
	Show,
	type Component,
	type Setter,
} from "solid-js";
import { FiMoon, FiSun } from "solid-icons/fi";

import { A } from "@solidjs/router";

export type ThemeMode = "system" | "dark" | "light";

const ThemeModeIcon = (props: {
	theme: ThemeMode;
	setTheme: Setter<ThemeMode>;
}) => {
	return (
		<Show
			when={props.theme === "light"}
			fallback={<FiMoon onClick={() => props.setTheme("light")} />}
		>
			<FiSun onClick={() => props.setTheme("dark")} />
		</Show>
	);
};

export const Header: Component = () => {
	const [theme, setTheme] = createSignal<ThemeMode>(
		(localStorage.getItem("theme") || "system") as ThemeMode,
	);

	createEffect(() => {
		let themeMode = theme();

		if (theme() === "system") {
			if (window.matchMedia) {
				if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
					themeMode = "dark";
				} else {
					themeMode = "light";
				}
			} else {
				themeMode = "dark";
			}
		}

		setTheme(themeMode);

		document.body.classList.remove("light", "dark");
		document.body.classList.add(themeMode);
	});

	createEffect(
		on(
			() => theme(),
			() => {
				localStorage.setItem("theme", theme());
			},
		),
	);

	const StorageEventHandler = (e: StorageEvent) => {
		if (e.key === "theme") {
			setTheme(e.newValue as ThemeMode);
		}
	};

	onMount(() => {
		window.addEventListener("storage", StorageEventHandler);
	});

	return (
		<header id="header-main">
			<A href="/">
				<h1>TMA Studio</h1>
			</A>

			<ul>
				<li>
					<a
						href="https://github.com/erfanmola/TMA-Studio?tab=readme-ov-file#roadmap"
						target="_blank"
						rel="noreferrer"
					>
						Roadmap
					</a>
				</li>
				<li>
					<a
						href="https://github.com/erfanmola/TMA-Studio"
						target="_blank"
						rel="noreferrer"
					>
						Github
					</a>
				</li>
				<li>
					<a href="https://t.me/TMADevelopers" target="_blank" rel="noreferrer">
						Group
					</a>
				</li>
				<li>
					<a href="https://t.me/TMA_Studio" target="_blank" rel="noreferrer">
						Channel
					</a>
				</li>
				<li>
					<ThemeModeIcon theme={theme()} setTheme={setTheme} />
				</li>
			</ul>
		</header>
	);
};
