import "./Footer.scss";

import { FaSolidHeart } from "solid-icons/fa";
import { IoSettingsSharp } from "solid-icons/io";

const Footer = () => {
	return (
		<footer id="footer-main">
			<ul>
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
