import "./Sidebar.scss";

import { preferences, setPreferences } from "@renderer/utils/preferences";

import { OcSidebarexpand2 } from "solid-icons/oc";
import type { ParentComponent } from "solid-js";

const Sidebar: ParentComponent = (props) => {
	return (
		<aside
			id="sidebar-main"
			classList={{ open: preferences.ui.sidebar.visible }}
		>
			{props.children}
			<ul>
				<li onClick={() => setPreferences("ui", "sidebar", "visible", false)}>
					<OcSidebarexpand2 />
				</li>
			</ul>
		</aside>
	);
};

export default Sidebar;
