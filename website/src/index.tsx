import "./app.scss";

import { Route, Router } from "@solidjs/router";

import { AnimationProvider } from "./context/AnimationContext";
import { HomePage } from "./pages/Home";
import { createIntersectionObserver } from "@solid-primitives/intersection-observer";
import { createSignal } from "solid-js";
/* @refresh reload */
import { render } from "solid-js/web";

const root = document.getElementById("root");

render(() => {
	const [animationTargets, setAnimationTargets] = createSignal<Element[]>([]);
	const addAnimationTarget = (e: Element) =>
		setAnimationTargets([...animationTargets(), e]);

	createIntersectionObserver(animationTargets, (entries, observer) => {
		for (const e of entries) {
			if (e.isIntersecting) {
				observer.unobserve(e.target);
				e.target.classList.add(
					"animate__animated",
					`animate__${e.target.getAttribute("data-animation")}`,
				);
			}
		}
	});

	return (
		<AnimationProvider value={{ addAnimationTarget }}>
			<Router>
				<Route path="/" component={HomePage} />
			</Router>
		</AnimationProvider>
	);
}, root!);
