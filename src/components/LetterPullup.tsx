import { Motion } from "solid-motionone";

import { For, type Component } from "solid-js";

interface LetterPullupProps {
	class?: string;
	words: string;
	delay?: number;
}

export const LetterPullup: Component<LetterPullupProps> = (props) => {
	const letters = props.words.split("");

	return (
		<div class="flex justify-center">
			<For each={letters}>
				{(letter, i) => (
					<Motion.h1
						initial={{
							y: 100,
							opacity: 0,
						}}
						animate={{ y: [100, -20, 10, 0], opacity: 1 }}
						transition={{
							delay: i() * (props.delay ? props.delay : 0.05),
							duration: 0.625,
							easing: ["ease-out", "ease-out", "ease-out"],
						}}
						class={props.class}
						style={{ "will-change": "auto" }}
					>
						{letter === " " ? <span>&nbsp;</span> : letter}
					</Motion.h1>
				)}
			</For>
		</div>
	);
};
