import { render } from "@solidjs/web";
import App from "./App";
import "../../../packages/ui/src/styles/index.scss";

const root = document.getElementById("root");
if (!root) throw new Error("Missing renderer root element");

render(() => <App />, root);
