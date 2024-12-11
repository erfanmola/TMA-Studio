import "./Footer.scss";

import type { Component } from "solid-js";
import { FaSolidHeart } from "solid-icons/fa";
import { useAnimation } from "../context/AnimationContext";

export const Footer: Component = () => {
	const { addAnimationTarget } = useAnimation();

	return (
		<footer id="footer-main" ref={addAnimationTarget} data-animation="fadeInUp">
			<span>Copyright © 2024. All Rights Reserved.</span>

			<span>
				Made with <FaSolidHeart /> by{" "}
				<a href="https://erfanmola.ir">Erfan Mola</a>
			</span>
		</footer>
	);
};
