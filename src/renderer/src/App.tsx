import { Route, Router } from "@solidjs/router";

import IndexPage from "./pages/Index";
import MainPage from "./pages/Main";
import { SettingsProvider } from "./contexts/SettingsContext";
import WelcomePage from "./pages/Welcome";

const App = () => {
	return (
		<SettingsProvider value={{ settings: window.store }}>
			<Router>
				<Route path="/" component={IndexPage} />
				<Route path="/welcome" component={WelcomePage} />
				<Route path="/main" component={MainPage} />
			</Router>
		</SettingsProvider>
	);
};

export default App;
