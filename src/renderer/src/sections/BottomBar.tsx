import { tgEmitEvent } from "@renderer/utils/telegram";
import "../scss/sections/_bottom-bar.scss";

import type {
	TelegramButtonMain,
	TelegramButtonSecondary,
} from "@renderer/types";
import {
	TelegramThemes,
	type TelegramPlatform,
	type ThemeMode,
} from "@renderer/utils/themes";
import { TbLoader2 } from "solid-icons/tb";
import { type Component, Show, type Signal } from "solid-js";

export const BottomBar: Component<{
	platform: TelegramPlatform;
	mode: ThemeMode;
	signalColorBottomBar: Signal<string | undefined>;
	buttonMain: TelegramButtonMain;
	buttonSecondary: TelegramButtonSecondary;
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	webview: any;
}> = (props) => {
	const [colorBottomBar] = props.signalColorBottomBar;

	const onClickButtonMain = () => {
		tgEmitEvent("main_button_pressed", {}, props.webview, props.platform);
	};
	const onClickButtonSecondary = () => {
		tgEmitEvent("secondary_button_pressed", {}, props.webview, props.platform);
	};

	return (
		<div
			id="section-telegram-bottombar"
			class={`${props.platform} ${props.mode}`}
			style={{
				"background-color":
					colorBottomBar() ??
					TelegramThemes[props.platform][props.mode].bottom_bar_bg_color,
			}}
		>
			<Show
				when={props.buttonMain.is_visible || props.buttonSecondary.is_visible}
			>
				<ul
					classList={{
						column:
							["top", "bottom"].includes(props.buttonMain.position ?? "") ||
							["top", "bottom"].includes(props.buttonSecondary.position ?? ""),
					}}
				>
					<Show when={props.buttonSecondary.is_visible}>
						<li class={`${props.buttonSecondary.position ?? ""}`}>
							<button
								type="button"
								style={{
									"background-color": props.buttonSecondary.color,
									color: props.buttonSecondary.text_color,
								}}
								disabled={!props.buttonSecondary.is_active}
								classList={{ shine: props.buttonSecondary.has_shine_effect }}
								onClick={onClickButtonSecondary}
							>
								<Show
									when={props.buttonSecondary.is_progress_visible}
									fallback={<span>{props.buttonSecondary.text}</span>}
								>
									<TbLoader2 />
								</Show>
							</button>
						</li>
					</Show>

					<Show when={props.buttonMain.is_visible}>
						<li class={`${props.buttonMain.position ?? ""}`}>
							<button
								type="button"
								style={{
									"background-color": props.buttonMain.color,
									color: props.buttonMain.text_color,
								}}
								disabled={!props.buttonMain.is_active}
								classList={{ shine: props.buttonMain.has_shine_effect }}
								onClick={onClickButtonMain}
							>
								<Show
									when={props.buttonMain.is_progress_visible}
									fallback={<span>{props.buttonMain.text}</span>}
								>
									<TbLoader2 />
								</Show>
							</button>
						</li>
					</Show>
				</ul>
			</Show>
		</div>
	);
};
