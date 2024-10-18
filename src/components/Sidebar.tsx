import "./Sidebar.scss";

import type { ParentComponent } from "solid-js";

const Sidebar: ParentComponent = (props) => {
	return <aside id="sidebar-main">{props.children}</aside>;
};

export default Sidebar;
