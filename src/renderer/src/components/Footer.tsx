import "./Footer.scss";

import { setActiveTabId, setTabbarData, tabbarData } from "./Tabbar";
import { setSidebarVisibility, sidebarVisiblity } from "./Sidebar";

import { FaSolidHeart } from "solid-icons/fa";
import { IoSettingsSharp } from "solid-icons/io";
import { OcSidebarcollapse2 } from "solid-icons/oc";
import PreferencesPage from "@renderer/pages/Preferences";
import { Show } from "solid-js";

const Footer = () => {
	const onClickPreferences = () => {
		if (!tabbarData().find((item) => item.id === "preferences")) {
			setTabbarData([
				...tabbarData(),
				{
					id: "preferences",
					title: "Preferences",
					dynamic: true,
					component: () => <PreferencesPage />,
					closable: true,
				},
			]);
		}
		setActiveTabId("preferences");
	};

	return (
		<footer id="footer-main">
			<ul>
				<Show when={!sidebarVisiblity()}>
					<li>
						<button type="button" onClick={() => setSidebarVisibility(true)}>
							<OcSidebarcollapse2 style={{ "font-size": "1.325rem" }} />
						</button>
					</li>
				</Show>

				<li>
					<button type="button" onClick={onClickPreferences}>
						<IoSettingsSharp />
						Preferences
					</button>
				</li>
			</ul>

			<span>
				Made with <FaSolidHeart /> by Erfan Mola | Version:{" "}
				{window.version.get()}
			</span>
		</footer>
	);
};

export default Footer;
