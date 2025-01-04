import { tgEmitEvent, type TMAProjectInner } from "@renderer/utils/telegram";
import "../scss/sections/_bottom-bar.scss";

import { TelegramThemes } from "@renderer/utils/themes";
import { TbLoader2 } from "solid-icons/tb";
import { type Component, Show } from "solid-js";
import type { TMAProjectFrame } from "@renderer/pages/Project";
import type { SetStoreFunction } from "solid-js/store";

export const BottomBar: Component<{
	projectFrameStore: [TMAProjectFrame, SetStoreFunction<TMAProjectFrame>];
	projectInnerStore: [TMAProjectInner, SetStoreFunction<TMAProjectInner>];
}> = (props) => {
	const [projectFrame] = props.projectFrameStore;
	const [projectInner] = props.projectInnerStore;

	const onClickButtonMain = () => {
		tgEmitEvent(
			"main_button_pressed",
			{},
			projectInner.webview,
			projectFrame.platform,
		);
	};
	const onClickButtonSecondary = () => {
		tgEmitEvent(
			"secondary_button_pressed",
			{},
			projectInner.webview,
			projectFrame.platform,
		);
	};

	return (
		<div
			id="section-telegram-bottombar"
			class={`${projectFrame.platform} ${projectFrame.state.mode}`}
			style={{
				"background-color":
					projectInner.theme.color.bottomBar ??
					TelegramThemes[projectFrame.platform][projectFrame.state.mode]
						.bottom_bar_bg_color,
			}}
		>
			<Show
				when={
					projectInner.buttonMain.is_visible ||
					projectInner.buttonSecondary.is_visible
				}
			>
				<ul
					classList={{
						column:
							["top", "bottom"].includes(
								projectInner.buttonMain.position ?? "",
							) ||
							["top", "bottom"].includes(
								projectInner.buttonSecondary.position ?? "",
							),
					}}
				>
					<Show when={projectInner.buttonSecondary.is_visible}>
						<li class={`${projectInner.buttonSecondary.position ?? ""}`}>
							<button
								type="button"
								style={{
									"background-color": projectInner.buttonSecondary.color,
									color: projectInner.buttonSecondary.text_color,
								}}
								disabled={!projectInner.buttonSecondary.is_active}
								classList={{
									shine: projectInner.buttonSecondary.has_shine_effect,
								}}
								onClick={onClickButtonSecondary}
							>
								<Show
									when={projectInner.buttonSecondary.is_progress_visible}
									fallback={<span>{projectInner.buttonSecondary.text}</span>}
								>
									<TbLoader2 />
								</Show>
							</button>
						</li>
					</Show>

					<Show when={projectInner.buttonMain.is_visible}>
						<li class={`${projectInner.buttonMain.position ?? ""}`}>
							<button
								type="button"
								style={{
									"background-color": projectInner.buttonMain.color,
									color: projectInner.buttonMain.text_color,
								}}
								disabled={!projectInner.buttonMain.is_active}
								classList={{ shine: projectInner.buttonMain.has_shine_effect }}
								onClick={onClickButtonMain}
							>
								<Show
									when={projectInner.buttonMain.is_progress_visible}
									fallback={<span>{projectInner.buttonMain.text}</span>}
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
