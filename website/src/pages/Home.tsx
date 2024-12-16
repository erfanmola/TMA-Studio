import "./Home.scss";

import Accordion from "../components/Accordion";
import type { Component } from "solid-js";
import DotPattern from "../components/DotPattern";
import { FaRegularUser } from "solid-icons/fa";
import { FiBox } from "solid-icons/fi";
import { FiTablet } from "solid-icons/fi";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import HorizontalRule from "../components/HorizontalRule";
import IconTMAStudio from "../assets/icons/icon.svg";
import { LetterPullup } from "../components/LetterPullup";
import { OcDependabot2 } from "solid-icons/oc";
import { TbLockCode } from "solid-icons/tb";
import { TbPlugConnected } from "solid-icons/tb";
import { register } from "swiper/element/bundle";
import { useAnimation } from "../context/AnimationContext";

register();

declare module "solid-js" {
	namespace JSX {
		interface IntrinsicElements {
			// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			"swiper-container": any;
			// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			"swiper-slide": any;
		}
	}
}

const SectionFeatures: Component = () => {
	const { addAnimationTarget } = useAnimation();

	return (
		<section
			id="container-home-section-features"
			ref={addAnimationTarget}
			data-animation="fadeInUp"
		>
			<HorizontalRule />

			<swiper-container
				class="container-slider-image"
				effect="cards"
				grab-cursor={true}
			>
				<swiper-slide>
					<img src="/assets/images/Home.png" alt="TMA Studio" />
				</swiper-slide>
				<swiper-slide>
					<img src="/assets/images/Project-DPXWallet.png" alt="TMA Studio" />
				</swiper-slide>
				<swiper-slide>
					<img src="/assets/images/Project-Floating.png" alt="TMA Studio" />
				</swiper-slide>
				<swiper-slide>
					<img src="/assets/images/Project-Simplist.png" alt="TMA Studio" />
				</swiper-slide>
				<swiper-slide>
					{/* biome-ignore lint/a11y/useMediaCaption: <explanation> */}
					<video
						src="https://github.com/erfanmola/TMA-Studio/raw/refs/heads/master/resources/demo-2-1080P-30FPS.mp4"
						controls
						autoplay
					/>
				</swiper-slide>
			</swiper-container>

			<h2>Features</h2>

			<ul>
				<li>
					<div>
						<TbPlugConnected />
					</div>
					<h3>Ease of Development</h3>
					<p>
						Test your apps locally without the need for HTTPS or tunneling
						solutions like ngrok.
					</p>
				</li>

				<li>
					<div>
						<FiTablet />
					</div>
					<h3>Simulated Environments</h3>
					<p>
						Experience native-like environments with Telegram Mini App features,
						including popups, buttons, haptics and more.
					</p>
				</li>

				<li>
					<div>
						<OcDependabot2 />
					</div>
					<h3>Mini Apps 2.0</h3>
					<p>
						Fully compatible with the latest Mini Apps 2.0 (WIP) features and
						updates.
					</p>
				</li>

				<li>
					<div>
						<FaRegularUser />
					</div>
					<h3>Mock User Data</h3>
					<p>
						Simulate user interactions with customizable mock data for efficient
						debugging.
					</p>
				</li>

				<li>
					<div>
						<FiBox />
					</div>
					<h3>Events and Methods</h3>
					<p>
						Over 90% of Telegram’s Mini App events and methods are supported,
						with ongoing updates.
					</p>
				</li>

				<li>
					<div>
						<TbLockCode />
					</div>
					<h3>InitData Signature</h3>
					<p>
						Sign and test your app’s initialization just like Telegram’s backend
						for real-world accuracy.
					</p>
				</li>
			</ul>
		</section>
	);
};

const SectionFAQ: Component = () => {
	const { addAnimationTarget } = useAnimation();

	return (
		<section
			id="container-home-section-faq"
			ref={addAnimationTarget}
			data-animation="fadeInUp"
		>
			<HorizontalRule />

			<h2>Frequently Asked Questions</h2>

			<div>
				<Accordion title="What is Telegram Mini App Studio?">
					<p>
						Telegram Mini App Studio is an integrated development environment
						designed to simplify the creation and testing of Telegram Mini Apps.
						It simulates Telegram features and allows local testing without the
						need for HTTPS or tunnels.
					</p>
				</Accordion>

				<Accordion title="Why should I use Telegram Mini App Studio?">
					<p>
						It saves time and effort by providing a realistic Telegram
						environment, supporting features like popups, haptic feedback, QR
						scanning, and more. Plus, it’s compatible with Mini Apps 2.0 and
						beyond.
					</p>
				</Accordion>

				<Accordion title="Can I test local projects with Telegram Mini App Studio?">
					<p>
						Yes, you can test local projects without HTTPS or tunneling
						solutions like ngrok, making the process faster and more efficient.
					</p>
				</Accordion>

				<Accordion title="What platforms does Telegram Mini App Studio support?">
					<p>
						Currently, it simulates Telegram environments for Android and iOS.
						Future updates will add support for Desktop, WebK, and WebA.
					</p>
				</Accordion>

				<Accordion title="Does it support all Telegram Mini App features?">
					<p>
						Over 90% of Telegram’s Mini App events and methods are supported,
						with ongoing updates to include new features and ensure full
						compatibility with Mini Apps 2.0.
					</p>
				</Accordion>

				<Accordion title="How is initData handled in the studio?">
					<p>
						Telegram Mini App Studio can optionally sign and verify initData
						using a bot token, just like Telegram’s backend, for realistic
						testing.
					</p>
				</Accordion>

				<Accordion title="Is Telegram Mini App Studio free?">
					<p>
						The project will be open-source on GitHub, but additional features,
						updates, or support might depend on available funding and community
						contributions.
					</p>
				</Accordion>

				<Accordion title="Can I contribute to the development of Telegram Mini App Studio?">
					<p>
						Yes! Once the project is public on GitHub, contributions from
						developers will be welcome to help improve and expand the tool.
					</p>
				</Accordion>
			</div>
		</section>
	);
};

export const HomePage: Component = () => {
	const { addAnimationTarget } = useAnimation();

	return (
		<div id="container-page-home">
			<DotPattern blurRadius={768} distance={16} size={1.25} />

			<div>
				<Header />

				<div>
					<div>
						<LetterPullup words="Telegram Mini App Studio" />
						<p ref={addAnimationTarget} data-animation="fadeInUp">
							The all-in-one tool to develop and test Telegram Mini Apps
							locally, with full support for Telegram Mini App features.
						</p>

						<div ref={addAnimationTarget} data-animation="fadeInUp">
							<a href="https://github.com/erfanmola/TMA-Studio/releases">
								Download
							</a>
						</div>
					</div>
					<div>
						<IconTMAStudio ref={addAnimationTarget} data-animation="fadeInUp" />
					</div>
				</div>

				<SectionFeatures />

				<SectionFAQ />

				<Footer />
			</div>
		</div>
	);
};
