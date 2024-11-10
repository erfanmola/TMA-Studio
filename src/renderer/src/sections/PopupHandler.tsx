import "../scss/sections/_popup.scss";

import type { TelegramPopup } from "@renderer/types";
import type { TelegramPlatform, ThemeMode } from "@renderer/utils/themes";
import {
	batch,
	type Component,
	For,
	Match,
	Show,
	type Signal,
	Switch,
} from "solid-js";

export const PopupHandler: Component<{
	platform: TelegramPlatform;
	mode: ThemeMode;
	signalPopup: Signal<TelegramPopup | undefined>;
	signalPopupPressId: Signal<string | undefined>;
}> = (props) => {
	const [popup, setPopup] = props.signalPopup;
	const [, setPopupPressID] = props.signalPopupPressId;

	const onClickButton = (id: string) => {
		batch(() => {
			setPopup(undefined);
			setPopupPressID(id ?? "");
		});
	};

	return (
		<Show when={popup()}>
			<div class={`popup-overlay ${props.platform} ${props.mode}`}>
				<div
					onClick={() => onClickButton("")}
					onKeyUp={() => onClickButton("")}
				/>

				<section>
					<div>
						<Show when={popup()?.title}>
							<b>{popup()?.title}</b>
						</Show>

						<Show when={popup()?.message}>
							<p>{popup()?.message}</p>
						</Show>
					</div>

					<Show when={popup()?.buttons}>
						<ul>
							<For each={popup()?.buttons}>
								{(button) => (
									<li
										onClick={() => onClickButton(button.id ?? "")}
										onKeyUp={() => onClickButton(button.id ?? "")}
									>
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
