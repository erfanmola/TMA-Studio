import "./Sidebar.scss";

import { OcSidebarexpand2 } from "solid-icons/oc";
import {
	createEffect,
	createSignal,
	onMount,
	type ParentComponent,
} from "solid-js";
import { useSettings } from "../contexts/SettingsContext";

export const [sidebarVisiblity, setSidebarVisibility] = createSignal(false);

const Sidebar: ParentComponent = (props) => {
	const { settings } = useSettings();

	onMount(async () => {
		setSidebarVisibility((await settings?.get("sidebar_visible")) ?? true);
	});

	createEffect(async () => {
		await settings?.set("sidebar_visible", sidebarVisiblity());
		await settings?.save();
	});

	return (
		<aside id="sidebar-main" classList={{ open: sidebarVisiblity() }}>
			{props.children}
			<ul>
				<li
					onClick={() => setSidebarVisibility(false)}
					onKeyUp={() => setSidebarVisibility(false)}
				>
					<OcSidebarexpand2 />
				</li>
			</ul>
		</aside>
	);
};

export default Sidebar;
