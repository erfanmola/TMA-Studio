import "./app.scss";

import { Route, Router } from "@solidjs/router";

import { HomePage } from "./pages/Home";
/* @refresh reload */
import { render } from "solid-js/web";

const root = document.getElementById("root");

render(
	() => (
		<Router>
			<Route path="/" component={HomePage} />
		</Router>
	),
	// biome-ignore lint/style/noNonNullAssertion: <explanation>
	root!,
);
