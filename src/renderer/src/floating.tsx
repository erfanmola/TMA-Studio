import "./app.scss";

import { HashRouter, Route } from "@solidjs/router";

import FloatingProject from "./components/FloatingProject";
import { SettingsProvider } from "./contexts/SettingsContext";
/* @refresh reload */
import { render } from "solid-js/web";

render(
	() => (
		<SettingsProvider value={{ settings: window.api.store }}>
			<HashRouter>
				<Route path="/:project/:platform" component={FloatingProject} />
			</HashRouter>
		</SettingsProvider>
	),
	document.getElementById("root") as HTMLElement,
);
