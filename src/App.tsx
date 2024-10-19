import { Route, Router } from "@solidjs/router";
import { Show, Suspense, createResource } from "solid-js";

import { SettingsProvider } from "./contexts/SettingsContext";
import WelcomePage from "./pages/Welcome";
import { createStore, type Store } from "@tauri-apps/plugin-store";
import IndexPage from "./pages/Index";
import MainPage from "./pages/Main";

const App = () => {
	const [settings] = createResource<Store>(async () => {
		return await createStore("store.bin");
	});

	return (
		<Suspense>
			<Show when={settings()}>
				<SettingsProvider value={{ settings: settings() }}>
					<Router>
						<Route path="/" component={IndexPage} />
						<Route path="/welcome" component={WelcomePage} />
						<Route path="/main" component={MainPage} />
					</Router>
				</SettingsProvider>
			</Show>
		</Suspense>
	);
};

export default App;
