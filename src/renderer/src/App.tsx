import { HashRouter, Route } from "@solidjs/router";
import semver from "semver";
import { onMount } from "solid-js";
import { ghRepoURL } from "./components/Header";
import { SettingsProvider } from "./contexts/SettingsContext";
import IndexPage from "./pages/Index";
import MainPage from "./pages/Main";
import WelcomePage from "./pages/Welcome";

const App = () => {
	onMount(async () => {
		try {
			const request = await fetch(
				`${ghRepoURL.replace("github.com/", "raw.githubusercontent.com/")}/refs/heads/master/package.json`,
			);
			const result = await request.json();
			if (semver.gt(result.version, window.api.version.get())) {
				window.electron.ipcRenderer.send("update-available", result.version);
			}
		} catch (_e) {}
	});

	return (
		<SettingsProvider value={{ settings: window.api.store }}>
			<HashRouter>
				<Route path="/" component={IndexPage} />
				<Route path="/welcome" component={WelcomePage} />
				<Route path="/main" component={MainPage} />
			</HashRouter>
		</SettingsProvider>
	);
};

export default App;
