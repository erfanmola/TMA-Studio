import "../scss/sections/_popup.scss";

import type { TMAProjectFrame } from "@renderer/pages/Project";
import type { TMAProjectInner } from "@renderer/utils/telegram";
import { type Component, For, Match, Show, Switch } from "solid-js";
import type { SetStoreFunction } from "solid-js/store";

export const PopupHandler: Component<{
	projectFrameStore: [TMAProjectFrame, SetStoreFunction<TMAProjectFrame>];
	projectInnerStore: [TMAProjectInner, SetStoreFunction<TMAProjectInner>];
}> = (props) => {
	const [projectFrame] = props.projectFrameStore;
	const [projectInner, setProjectInner] = props.projectInnerStore;

	const onClickButton = (id: string) => {
		setProjectInner("popup", "regular", {
			popup: undefined,
			press_id: id ?? "",
		});
	};

	return (
		<Show when={projectInner.popup.regular.popup}>
			<div
				class={`popup-overlay ${projectFrame.platform} ${projectFrame.state.mode}`}
			>
				<div onClick={() => onClickButton("")} />

				<section>
					<div>
						<Show when={projectInner.popup.regular.popup?.title}>
							<b>{projectInner.popup.regular.popup?.title}</b>
						</Show>

						<Show when={projectInner.popup.regular.popup?.message}>
							<p>{projectInner.popup.regular.popup?.message}</p>
						</Show>
					</div>

					<Show when={projectInner.popup.regular.popup?.buttons}>
						<ul>
							<For each={projectInner.popup.regular.popup?.buttons}>
								{(button) => (
									<li onClick={() => onClickButton(button.id ?? "")}>
										<Switch>
											<Match when={button.type === "cancel"}>
												<span>Cancel</span>
											</Match>

											<Match when={button.type === "close"}>
												<span>Close</span>
											</Match>

											<Match when={button.type === "ok"}>
												<span>Ok</span>
											</Match>

											<Match when={button.type === "destructive"}>
												<span class="destructive">{button.text}</span>
											</Match>

											<Match when={button.type === "default"}>
												<span>{button.text}</span>
											</Match>
										</Switch>
									</li>
								)}
							</For>
						</ul>
					</Show>
				</section>
			</div>
		</Show>
	);
};
