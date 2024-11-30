import "./app.scss";
import "./scss/_general.scss";

import App from "./App";
/* @refresh reload */
import { render } from "solid-js/web";

render(() => <App />, document.getElementById("root") as HTMLElement);
