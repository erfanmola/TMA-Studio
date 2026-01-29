import "./tailwind.css";
import "./app.scss";
import "./scss/_general.scss";
import "@electron-uikit/titlebar/renderer";

/* @refresh reload */
import { render } from "solid-js/web";
import App from "./App";

render(() => <App />, document.getElementById("root") as HTMLElement);
