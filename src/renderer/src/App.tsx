import { HashRouter, Route } from "@solidjs/router";

import IndexPage from "./pages/Index";
import MainPage from "./pages/Main";
import { SettingsProvider } from "./contexts/SettingsContext";
import WelcomePage from "./pages/Welcome";
import { ghRepoURL } from "./components/Header";
import { onMount } from "solid-js";
import semver from "semver";

const App = () => {
	onMount(async () => {
		try {
			const request = await fetch(
				`${ghRepoURL.replace("github.com/", "raw.githubusercontent.com/")}/refs/heads/master/package.json`,
			);
			const result = await request.json();
			if (semver.gt(result.version, window.version.get())) {
				window.electron.ipcRenderer.send("update-available", result.version);
			}
		} catch (e) {}
	});

	return (
		<SettingsProvider value={{ settings: window.store }}>
			<HashRouter>
				<Route path="/" component={IndexPage} />
				<Route path="/welcome" component={WelcomePage} />
				<Route path="/main" component={MainPage} />
			</HashRouter>
		</SettingsProvider>
	);
};

export default App;
