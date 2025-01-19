import "../scss/sections/_viewport-macos.scss";

import { FrameMacOS } from "@renderer/components/DeviceFrames";
import type { Project } from "@renderer/types";
import { stringToColorDark, getNameInitials } from "@renderer/utils/general";
import {
	generateProjectInner,
	generateProjectMenuMore,
	type TMAProjectInner,
} from "@renderer/utils/telegram";
import { TelegramThemes } from "@renderer/utils/themes";

import { type Component, Show } from "solid-js";
import { BottomBar } from "./BottomBar";
import { RiEditorAttachment2, RiSystemCloseFill } from "solid-icons/ri";
import { TbSticker } from "solid-icons/tb";
import { TiMicrophoneOutline } from "solid-icons/ti";
import { BiRegularWindow } from "solid-icons/bi";

import { createStore, type SetStoreFunction } from "solid-js/store";
import { MenuMore, type MenuMoreStore } from "./MenuMore";
import { IoArrowBackOutline } from "solid-icons/io";
import { FiMoreVertical } from "solid-icons/fi";
import type { TMAProjectFrame } from "@renderer/pages/Project";
import { TMAView, TMAViewOverlay } from "./TMAView";

export const ViewportMacOS: Component<{
	project: Project;
	projectFrameStore: [TMAProjectFrame, SetStoreFunction<TMAProjectFrame>];
	placeholder: boolean;
}> = (props) => {
	const [projectFrame, setProjectFrame] = props.projectFrameStore;
	const [projectInner, setProjectInner] = createStore<TMAProjectInner>(
		generateProjectInner(projectFrame),
	);
	const [menuMore, setMenuMore] = createStore<MenuMoreStore>(
		generateProjectMenuMore(),
	);

	setProjectFrame("state", "expanded", true);

	return (
		<FrameMacOS
			classList={{
				// shake: preferences.project.shake_on_haptic && projectInner.shake,
				placeholder: props.placeholder,
			}}
		>
			<Show when={!props.placeholder}>
				<div
					id="viewport-telegram-macos"
					classList={{
						open: projectFrame.state.open,
						// expanded: projectFrame.state.expanded,
						dark: projectFrame.state.mode === "dark",
					}}
				>
					<header
						style={{
							"background-color":
								TelegramThemes[projectFrame.platform][projectFrame.state.mode]
									.header_bg_color,
							color:
								TelegramThemes[projectFrame.platform][projectFrame.state.mode]
									.text_color,
						}}
					>
						<div>
							<div>
								<span
									style={{
										"background-color": stringToColorDark(props.project.id),
									}}
								>
									{getNameInitials(props.project.name)}
								</span>
							</div>

							<div>
								<h2>{props.project.name}</h2>
								<span
									style={{
										color:
											TelegramThemes[projectFrame.platform][
												projectFrame.state.mode
											].text_color,
									}}
								>
									bot
								</span>
							</div>
						</div>
						<div>
							<span
								style={{
									color:
										TelegramThemes[projectFrame.platform][
											projectFrame.state.mode
										].text_color,
								}}
							>
								<FiMoreVertical />
							</span>
						</div>
					</header>
					<div />

					<Show
						when={projectFrame.state.open}
						fallback={
							<footer
								style={{
									"background-color":
										TelegramThemes[projectFrame.platform][
											projectFrame.state.mode
										].secondary_bg_color,
									color:
										TelegramThemes[projectFrame.platform][
											projectFrame.state.mode
										].subtitle_text_color,
								}}
							>
								<button
									type="button"
									onClick={() => setProjectFrame("state", "open", true)}
									style={{
										"background-color":
											TelegramThemes[projectFrame.platform][
												projectFrame.state.mode
											].button_color,
										color:
											TelegramThemes[projectFrame.platform][
												projectFrame.state.mode
											].button_text_color,
									}}
								>
									<BiRegularWindow />
									{props.project.name}
								</button>
								<RiEditorAttachment2 />
								<div
									style={{
										"background-color":
											TelegramThemes[projectFrame.platform][
												projectFrame.state.mode
											].section_bg_color,
									}}
								>
									<span>Message</span>
									<TbSticker />
								</div>
								<TiMicrophoneOutline />
							</footer>
						}
					>
						<span />
						<section
							classList={{
								// expanded: projectFrame.state.expanded,
								dark: projectFrame.state.mode === "dark",
							}}
							style={{
								"background-color":
									TelegramThemes[projectFrame.platform][projectFrame.state.mode]
										.header_bg_color,
								color:
									TelegramThemes[projectFrame.platform][projectFrame.state.mode]
										.text_color,
							}}
						>
							<Show when={projectFrame.state.open}>
								<header
									style={{
										"background-color":
											TelegramThemes[projectFrame.platform][
												projectFrame.state.mode
											].header_bg_color,
										color:
											TelegramThemes[projectFrame.platform][
												projectFrame.state.mode
											].text_color,
									}}
								>
									<div>
										<span
											style={{
												color:
													TelegramThemes[projectFrame.platform][
														projectFrame.state.mode
													].text_color,
											}}
											onClick={() =>
												setMenuMore("closeOrBack", "clicked", true)
											}
										>
											<Show
												when={projectInner.backButton.enabled}
												fallback={<RiSystemCloseFill />}
											>
												<IoArrowBackOutline />
											</Show>
										</span>
									</div>
									<div>
										<div
											style={{
												"background-color":
													TelegramThemes[projectFrame.platform][
														projectFrame.state.mode
													].bg_color,
											}}
										>
											<span
												style={{
													"background-color": stringToColorDark(
														props.project.id,
													),
												}}
											>
												{getNameInitials(props.project.name)}
											</span>
											<h2>{props.project.name}</h2>
										</div>
									</div>
									<div
										style={{
											color:
												TelegramThemes[projectFrame.platform][
													projectFrame.state.mode
												].text_color,
										}}
									>
										<MenuMore
											menuMoreStore={[menuMore, setMenuMore]}
											projectFrameStore={[projectFrame, setProjectFrame]}
											projectInnerStore={[projectInner, setProjectInner]}
										/>
									</div>
								</header>
							</Show>

							<section
								style={{
									"background-color":
										projectInner.theme.color.background ??
										TelegramThemes[projectFrame.platform][
											projectFrame.state.mode
										].bg_color,
								}}
							>
								<TMAView
									project={props.project}
									menuMoreStore={[menuMore, setMenuMore]}
									projectFrameStore={[projectFrame, setProjectFrame]}
									projectInnerStore={[projectInner, setProjectInner]}
								/>
							</section>
							<BottomBar
								projectFrameStore={[projectFrame, setProjectFrame]}
								projectInnerStore={[projectInner, setProjectInner]}
							/>
						</section>
					</Show>

					<TMAViewOverlay
						projectFrameStore={[projectFrame, setProjectFrame]}
						projectInnerStore={[projectInner, setProjectInner]}
					/>
				</div>
			</Show>
		</FrameMacOS>
	);
};
