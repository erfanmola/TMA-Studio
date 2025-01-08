import "./Footer.scss";

import { preferences, setPreferences } from "@renderer/utils/preferences";

import { FaSolidHeart } from "solid-icons/fa";
import { IoSettingsSharp } from "solid-icons/io";
import { OcSidebarcollapse2 } from "solid-icons/oc";
import PreferencesPage from "@renderer/pages/Preferences";
import { Show } from "solid-js";

const Footer = () => {
	const onClickPreferences = () => {
		if (!preferences.tabbar.tabs.find((item) => item.id === "preferences")) {
			setPreferences("tabbar", "tabs", [
				...preferences.tabbar.tabs,
				{
					id: "preferences",
					title: "Preferences",
					dynamic: true,
					component: () => <PreferencesPage />,
					closable: true,
				},
			]);
		}
		setPreferences("tabbar", "active", "preferences");
	};

	return (
		<footer id="footer-main">
			<ul>
				<Show when={!preferences.ui.sidebar.visible}>
					<li>
						<button
							type="button"
							onClick={() => setPreferences("ui", "sidebar", "visible", true)}
						>
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
				{window.api.version.get()}
			</span>
		</footer>
	);
};

export default Footer;
