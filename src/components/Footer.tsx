import "./Footer.scss";

import { setSidebarVisibility, sidebarVisiblity } from "./Sidebar";

import { FaSolidHeart } from "solid-icons/fa";
import { IoSettingsSharp } from "solid-icons/io";
import { OcSidebarcollapse2 } from "solid-icons/oc";
import { Show } from "solid-js";

const Footer = () => {
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
					<button type="button">
						<IoSettingsSharp />
						Preferences
					</button>
				</li>
			</ul>

			<span>
				Made with <FaSolidHeart /> by Erfan Mola
			</span>
		</footer>
	);
};

export default Footer;
