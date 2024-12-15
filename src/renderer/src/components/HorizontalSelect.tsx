import { For, type Component, type Signal } from "solid-js";
import "./HorizontalSelect.scss";

export type HorizontalSelectItem = {
	title: string;
	value: string | number | boolean;
};

export const HorizontalSelect: Component<{
	items: HorizontalSelectItem[];
	signal: Signal<string> | Signal<number> | Signal<boolean>;
}> = (props) => {
	return (
		<ul class="horizontal-select">
			<For each={props.items}>
				{(item) => (
					<li
						classList={{ active: item.value === props.signal[0]() }}
						onClick={() => (props.signal[1] as any)(item.value)}
						onKeyUp={() => (props.signal[1] as any)(item.value)}
					>
						<span>{item.title}</span>
					</li>
				)}
			</For>
		</ul>
	);
};
