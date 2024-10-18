import type { Component } from "solid-js";

const DotPattern: Component<{
	blurRadius?: number;
	distance?: number;
	size?: number;
}> = (props) => {
	return (
		<svg
			aria-hidden="true"
			class="pointer-events-none absolute inset-0 h-full w-full fill-neutral-400/80 -z-10"
			style={{
				"mask-image": `radial-gradient(${(props.blurRadius ?? 250) * 2}px circle at center,white,transparent)`,
			}}
		>
			<defs>
				<pattern
					id=":r4k:"
					width={props.distance ?? 16}
					height={props.distance ?? 16}
					patternUnits="userSpaceOnUse"
					patternContentUnits="userSpaceOnUse"
					x="0"
					y="0"
				>
					<circle
						id="pattern-circle"
						cx={props.size ?? 1}
						cy={props.size ?? 1}
						r={props.size ?? 1}
					/>
				</pattern>
			</defs>
			<rect width="100%" height="100%" stroke-width="0" fill="url(#:r4k:)" />
		</svg>
	);
};

export default DotPattern;
