import "./tailwind.css";
import "./app.scss";

import { HashRouter, Route } from "@solidjs/router";
/* @refresh reload */
import { render } from "solid-js/web";
import FloatingProject from "./components/FloatingProject";
import { SettingsProvider } from "./contexts/SettingsContext";

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
