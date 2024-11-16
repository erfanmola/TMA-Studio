import "../scss/sections/_viewport-ios.scss";

import { IPhoneFrame } from "@renderer/components/DeviceFrames";
import type {
	Project,
	TelegramPopup,
	TelegramScanQRPopup,
	TelegramMethodEvent,
	TelegramStory,
} from "@renderer/types";
import { stringToColorDark, getNameInitials } from "@renderer/utils/general";
import {
	tgEmitEvent,
	tgWebAppData,
	tgEventHandler,
} from "@renderer/utils/telegram";
import {
	type TelegramPlatform,
	type ThemeMode,
	TelegramThemes,
} from "@renderer/utils/themes";
import { users, activeUserId } from "@renderer/utils/user";
import { CgMoreO } from "solid-icons/cg";
import { FaSolidChevronLeft } from "solid-icons/fa";
import {
	type Component,
	type Signal,
	createSignal,
	createEffect,
	createResource,
	onCleanup,
	Show,
	on,
	batch,
} from "solid-js";
import { BottomBar } from "./BottomBar";
import { PopupHandler } from "./PopupHandler";
import { PopupQRHandler } from "./PopupQRHandler";
import { RiEditorAttachment2 } from "solid-icons/ri";
import { TbSticker } from "solid-icons/tb";
import { TiMicrophoneOutline } from "solid-icons/ti";
import { BiRegularWindow } from "solid-icons/bi";

import webviewStyle from "../scss/_webview.scss?inline";
import { PopupStoryHandler } from "./PopupStory";

export const ViewportIOS: Component<{
	project: Project;
	platform: TelegramPlatform;
	signalMode: Signal<ThemeMode>;
	signalExpanded: Signal<boolean>;
	signalInspectElement: Signal<boolean>;
	signalOpen: Signal<boolean>;
}> = (props) => {
	const [mode] = props.signalMode;
	const [expanded, setExpanded] = props.signalExpanded;
	const [inspectElement, setInspectElement] = props.signalInspectElement;
	const [open, setOpen] = props.signalOpen;

	const [backButtonEnabled, setBackButtonEnabled] = createSignal(false);
	const [closeConfirmationEnabled, setCloseConfirmationEnabled] =
		createSignal(false);
	const [verticalSwipeEnabled, setVerticalSwipeEnabled] = createSignal(false);

	const [popup, setPopup] = createSignal<TelegramPopup | undefined>(undefined);
	const [popupPressId, setPopupPressID] = createSignal<string | undefined>(
		undefined,
	);

	const [popupQR, setPopupQR] = createSignal<TelegramScanQRPopup | undefined>(
		undefined,
	);
	const [popupQRData, setPopupQRData] = createSignal<string | undefined>(
		undefined,
	);
	const [popupStory, setPopupStory] = createSignal<TelegramStory | undefined>(
		undefined,
	);

	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	let webview: any;

	const [statusBarColor, setStatusBarColor] = createSignal<"black" | "white">(
		"black",
	);

	const [shake, setShake] = createSignal(false);

	const [colorHeader, setColorHeader] = createSignal<string | undefined>(
		undefined,
	);
	const [colorHeaderText, setColorHeaderText] = createSignal<
		string | undefined
	>(undefined);
	const [colorBackground, setColorBackground] = createSignal<
		string | undefined
	>(undefined);

	// Set Statusbar color based on theme colorScheme
	createEffect(() => {
		if (mode() === "dark") {
			setStatusBarColor("white");
		} else {
			if (expanded()) {
				setStatusBarColor("white");
			} else {
				setStatusBarColor("black");
			}
		}
	});

	// Notify the webview about theme change
	createEffect(
		on(
			mode,
			() => {
				if (!open()) return;

				tgEmitEvent(
					"theme_changed",
					{
						theme_params: TelegramThemes[props.platform][mode()],
					},
					webview,
					props.platform,
				);
			},
			{ defer: true },
		),
	);

	// Notify the webview about viewport change
	createEffect(
		on(
			expanded,
			() => {
				if (!open()) return;

				const { width, height } = webview.getBoundingClientRect();

				tgEmitEvent(
					"viewport_changed",
					{
						height: Math.round(height),
						width: Math.round(width),
						is_expanded: expanded(),
						is_state_stable: true,
					},
					webview,
					props.platform,
				);
			},
			{ defer: true },
		),
	);

	// Sync inspect element indicator and actual open/close state
	createEffect(
		on(
			inspectElement,
			() => {
				if (!open()) return;

				if (inspectElement() && !webview.isDevToolsOpened()) {
					webview.openDevTools();
				} else if (webview.isDevToolsOpened() && !inspectElement()) {
					webview.closeDevTools();
				}
			},
			{ defer: true },
		),
	);

	// Reset the buttonId of previous popups, if any
	createEffect(
		on(
			popup,
			() => {
				if (!open()) return;

				if (popup()) {
					setPopupPressID(undefined);
				}
			},
			{
				defer: true,
			},
		),
	);

	// Notify the webview about popup close
	createEffect(
		on(
			popupPressId,
			() => {
				if (!open()) return;

				if (typeof popupPressId() === "string") {
					if (popupPressId() === "tg_webapp_close_confirm") {
						CloseWebview();
					} else if (
						popupPressId()?.startsWith("tg_webapp_clipboard_confirm_")
					) {
						tgEmitEvent(
							"clipboard_text_received",
							{
								req_id: popupPressId()?.replace(
									"tg_webapp_clipboard_confirm_",
									"",
								),
								data: window.clipboard.getText(),
							},
							webview,
							props.platform,
						);
					} else if (
						popupPressId()?.startsWith("tg_webapp_clipboard_cancel_")
					) {
						tgEmitEvent(
							"clipboard_text_received",
							{
								req_id: popupPressId()?.replace(
									"tg_webapp_clipboard_cancel_",
									"",
								),
							},
							webview,
							props.platform,
						);
					} else if (popupPressId() === "tg_webapp_write_access_confirm") {
						tgEmitEvent(
							"write_access_requested",
							{
								status: "allowed",
							},
							webview,
							props.platform,
						);
					} else if (popupPressId() === "tg_webapp_write_access_cancel") {
						tgEmitEvent(
							"write_access_requested",
							{
								status: "cancelled",
							},
							webview,
							props.platform,
						);
					} else if (popupPressId() === "tg_webapp_contact_confirm") {
						tgEmitEvent(
							"phone_requested",
							{
								status: "sent",
							},
							webview,
							props.platform,
						);
					} else if (popupPressId() === "tg_webapp_contact_cancel") {
						tgEmitEvent(
							"phone_requested",
							{
								status: "cancelled",
							},
							webview,
							props.platform,
						);
					} else {
						tgEmitEvent(
							"popup_closed",
							{
								button_id: popupPressId(),
							},
							webview,
							props.platform,
						);
					}
				}
			},
			{
				defer: true,
			},
		),
	);

	// Reset the QR data of previous popups, if any, Notify close of popupQR too
	createEffect(
		on(
			popupQR,
			() => {
				if (!open()) return;

				if (popupQR()) {
					setPopupQRData(undefined);
				} else {
					tgEmitEvent("scan_qr_popup_closed", {}, webview, props.platform);
				}
			},
			{
				defer: true,
			},
		),
	);

	// Notify the webview about QR Scan popup data recieve
	createEffect(
		on(
			popupQRData,
			() => {
				if (!open()) return;

				if (typeof popupQRData() === "string") {
					tgEmitEvent(
						"qr_text_received",
						{
							data: popupQRData(),
						},
						webview,
						props.platform,
					);
				}
			},
			{
				defer: true,
			},
		),
	);

	const [webAppUrl] = createResource(async () => {
		return `${props.project.url}${await tgWebAppData(
			props.platform,
			mode(),
			users().find((item) => item.id === activeUserId()),
			props.project.token,
		)}`;
	});

	createEffect(() => {
		if (open()) {
			initializeWebview();
		}
	});

	const initializeWebview = async () => {
		if (!webview) return;

		webview.addEventListener("ipc-message", (e) => {
			if (import.meta.env.DEV) {
				console.log("Received message from webview:", e.channel, e.args);
			}

			if (e.channel === "method") {
				tgEventHandler(
					e.args[0] as TelegramMethodEvent,
					webview,
					props.platform,
					{
						signalMode: props.signalMode,
						signalExpanded: props.signalExpanded,
						signalOpen: [open, setOpen],
						signalBackButtonEnabled: [backButtonEnabled, setBackButtonEnabled],
						signalShake: [shake, setShake],
						signalPopup: [popup, setPopup],
						signalPopupQR: [popupQR, setPopupQR],
						signalColorHeader: [colorHeader, setColorHeader],
						signalColorHeaderText: [colorHeaderText, setColorHeaderText],
						signalColorBackground: [colorBackground, setColorBackground],
						signalCloseConfirmationEnabled: [
							closeConfirmationEnabled,
							setCloseConfirmationEnabled,
						],
						signalVerticalSwipeEnabled: [
							verticalSwipeEnabled,
							setVerticalSwipeEnabled,
						],
						signalPopupStory: [popupStory, setPopupStory],
					},
				);
			}
		});

		webview.addEventListener("did-attach", () => {
			webview.addEventListener("devtools-opened", () => {
				setInspectElement(true);
			});

			webview.addEventListener("devtools-closed", () => {
				setInspectElement(false);
			});
		});

		webview.addEventListener("dom-ready", () => {
			webview.insertCSS(webviewStyle);
		});

		onCleanup(() => {
			if (open() && webview?.isDevToolsOpened) {
				webview?.closeDevTools();
			}
		});
	};

	const onClickBackOrCloseButton = () => {
		if (backButtonEnabled()) {
			tgEmitEvent("back_button_pressed", {}, webview, props.platform);
		} else {
			if (closeConfirmationEnabled()) {
				setPopup({
					message: "Changes that you made may not be saved.",
					buttons: [
						{
							type: "cancel",
						},
						{
							id: "tg_webapp_close_confirm",
							type: "destructive",
							text: "Close Anyway",
						},
					],
				} as TelegramPopup);
			} else {
				CloseWebview();
			}
		}
	};

	const CloseWebview = () => {
		batch(() => {
			if (webview?.isDevToolsOpened) {
				webview?.closeDevTools();
			}
			webview = undefined;
			setOpen(false);
		});
	};

	createEffect(
		on(
			open,
			() => {
				if (!open()) {
					setInspectElement(false);
					setExpanded(false);
					setBackButtonEnabled(false);
					setCloseConfirmationEnabled(false);
				}
			},
			{
				defer: true,
			},
		),
	);

	return (
		<IPhoneFrame classList={{ shake: shake() }}>
			<div
				id="viewport-telegram-ios"
				classList={{
					expanded: expanded(),
					dark: mode() === "dark",
				}}
			>
				{/* biome-ignore lint/a11y/noSvgWithoutTitle: <explanation> */}
				<svg
					width="428"
					height="47"
					viewBox="0 0 428 47"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<path
						d="M61.3291 19.001C62.0029 19.001 62.6445 19.127 63.2539 19.3789C63.8633 19.6309 64.4023 20.0176 64.8711 20.5391C65.3457 21.0605 65.7178 21.7314 65.9873 22.5518C66.2568 23.3721 66.3916 24.3535 66.3916 25.4961V25.5137C66.3916 26.9375 66.1865 28.1562 65.7764 29.1699C65.3662 30.1836 64.7803 30.96 64.0186 31.499C63.2568 32.0381 62.3428 32.3076 61.2764 32.3076C60.4971 32.3076 59.7939 32.167 59.167 31.8857C58.5459 31.5986 58.0303 31.2061 57.6201 30.708C57.21 30.21 56.9375 29.6387 56.8027 28.9941L56.7852 28.8975H59.0088L59.0439 28.9766C59.1553 29.2754 59.3135 29.5361 59.5186 29.7588C59.7295 29.9756 59.9814 30.1455 60.2744 30.2686C60.5732 30.3916 60.9072 30.4531 61.2764 30.4531C61.9502 30.4531 62.498 30.2568 62.9199 29.8643C63.3477 29.4658 63.667 28.9355 63.8779 28.2734C64.0889 27.6055 64.209 26.8672 64.2383 26.0586C64.2441 25.9707 64.2471 25.8857 64.2471 25.8037C64.2471 25.7158 64.2471 25.6309 64.2471 25.5488L63.8516 23.4395C63.8516 22.9531 63.7402 22.5166 63.5176 22.1299C63.2949 21.7373 62.9932 21.4268 62.6123 21.1982C62.2373 20.9639 61.8154 20.8467 61.3467 20.8467C60.8838 20.8467 60.4619 20.9609 60.0811 21.1895C59.7002 21.4121 59.3955 21.7139 59.167 22.0947C58.9385 22.4756 58.8242 22.9062 58.8242 23.3867V23.4043C58.8242 23.8906 58.9326 24.3242 59.1494 24.7051C59.3662 25.0801 59.6621 25.376 60.0371 25.5928C60.418 25.8096 60.8457 25.918 61.3203 25.918C61.8008 25.918 62.2314 25.8125 62.6123 25.6016C62.9932 25.3848 63.2949 25.0918 63.5176 24.7227C63.7402 24.3535 63.8516 23.9287 63.8516 23.4482V23.4395H64.3789V25.7598H64.0801C63.9277 26.0938 63.7021 26.4072 63.4033 26.7002C63.1045 26.9873 62.7354 27.2188 62.2959 27.3945C61.8564 27.5703 61.3438 27.6582 60.7578 27.6582C59.9492 27.6582 59.2314 27.4766 58.6045 27.1133C57.9834 26.75 57.4971 26.252 57.1455 25.6191C56.7939 24.9863 56.6182 24.2715 56.6182 23.4746V23.457C56.6182 22.6016 56.8174 21.8369 57.2158 21.1631C57.6201 20.4893 58.1768 19.9619 58.8857 19.5811C59.6006 19.1943 60.415 19.001 61.3291 19.001ZM69.8115 30.2949C69.4189 30.2949 69.0879 30.1631 68.8184 29.8994C68.5547 29.6299 68.4229 29.3018 68.4229 28.915C68.4229 28.5283 68.5547 28.2031 68.8184 27.9395C69.0879 27.6699 69.4189 27.5352 69.8115 27.5352C70.2158 27.5352 70.5498 27.6699 70.8135 27.9395C71.0771 28.2031 71.209 28.5283 71.209 28.915C71.209 29.3018 71.0771 29.6299 70.8135 29.8994C70.5498 30.1631 70.2158 30.2949 69.8115 30.2949ZM69.8115 23.7734C69.4189 23.7734 69.0879 23.6416 68.8184 23.3779C68.5547 23.1084 68.4229 22.7803 68.4229 22.3936C68.4229 22.0068 68.5547 21.6816 68.8184 21.418C69.0879 21.1484 69.4189 21.0137 69.8115 21.0137C70.2158 21.0137 70.5498 21.1484 70.8135 21.418C71.0771 21.6816 71.209 22.0068 71.209 22.3936C71.209 22.7803 71.0771 23.1084 70.8135 23.3779C70.5498 23.6416 70.2158 23.7734 69.8115 23.7734ZM79.4189 32V29.5654H73.2139V27.7109C73.542 27.1367 73.876 26.5654 74.2158 25.9971C74.5557 25.4229 74.8984 24.8516 75.2441 24.2832C75.5957 23.709 75.9443 23.1436 76.29 22.5869C76.6416 22.0244 76.9902 21.4707 77.3359 20.9258C77.6875 20.3809 78.0361 19.8447 78.3818 19.3174H81.5811V27.6934H83.2949V29.5654H81.5811V32H79.4189ZM75.3145 27.7461H79.4541V21.1279H79.3311C79.0674 21.5264 78.7979 21.9365 78.5225 22.3584C78.2529 22.7803 77.9805 23.2109 77.7051 23.6504C77.4297 24.0898 77.1543 24.5322 76.8789 24.9775C76.6094 25.4229 76.3428 25.8682 76.0791 26.3135C75.8154 26.7529 75.5605 27.1895 75.3145 27.623V27.7461ZM88.0332 32V21.5498H87.8838L84.7285 23.7734V21.6465L88.042 19.3174H90.292V32H88.0332Z"
						fill={statusBarColor()}
					/>
					<path
						fill-rule="evenodd"
						clip-rule="evenodd"
						d="M328.724 18.6249H327.383C326.642 18.6249 326.041 19.2041 326.041 19.9186V31.1311C326.041 31.8456 326.642 32.4248 327.383 32.4248H328.724C329.465 32.4248 330.066 31.8456 330.066 31.1311V19.9186C330.066 19.2041 329.465 18.6249 328.724 18.6249ZM321.069 21.6438H322.41C323.151 21.6438 323.752 22.223 323.752 22.9375V31.1312C323.752 31.8458 323.151 32.425 322.41 32.425H321.069C320.328 32.425 319.727 31.8458 319.727 31.1312V22.9375C319.727 22.223 320.328 21.6438 321.069 21.6438ZM316.097 24.6623H314.755C314.014 24.6623 313.413 25.2415 313.413 25.956V31.131C313.413 31.8455 314.014 32.4247 314.755 32.4247H316.097C316.838 32.4247 317.438 31.8455 317.438 31.131V25.956C317.438 25.2415 316.838 24.6623 316.097 24.6623ZM309.783 27.2497H308.441C307.7 27.2497 307.1 27.8289 307.1 28.5435V31.131C307.1 31.8455 307.7 32.4247 308.441 32.4247H309.783C310.524 32.4247 311.125 31.8455 311.125 31.131V28.5435C311.125 27.8289 310.524 27.2497 309.783 27.2497Z"
						fill={statusBarColor()}
					/>
					<path
						fill-rule="evenodd"
						clip-rule="evenodd"
						d="M346.841 21.3228C349.678 21.3229 352.406 22.4391 354.462 24.4406C354.617 24.5951 354.864 24.5932 355.017 24.4362L356.496 22.9068C356.573 22.8272 356.617 22.7194 356.616 22.6072C356.615 22.495 356.571 22.3877 356.493 22.3091C351.097 17.0135 342.585 17.0135 337.189 22.3091C337.111 22.3877 337.067 22.4949 337.066 22.6071C337.065 22.7193 337.108 22.8272 337.185 22.9068L338.666 24.4362C338.818 24.5934 339.066 24.5954 339.22 24.4406C341.276 22.439 344.005 21.3228 346.841 21.3228ZM346.841 26.2985C348.4 26.2984 349.903 26.8916 351.058 27.9629C351.214 28.1149 351.46 28.1117 351.613 27.9555L353.091 26.4261C353.169 26.3459 353.212 26.237 353.211 26.1239C353.21 26.0109 353.164 25.9029 353.085 25.8244C349.567 22.4732 344.119 22.4732 340.601 25.8244C340.522 25.9029 340.476 26.0109 340.475 26.124C340.474 26.2372 340.517 26.346 340.595 26.4261L342.073 27.9555C342.225 28.1117 342.472 28.1149 342.628 27.9629C343.782 26.8923 345.284 26.2991 346.841 26.2985ZM349.802 29.6465C349.805 29.7599 349.761 29.8692 349.682 29.9487L347.125 32.5911C347.05 32.6687 346.948 32.7124 346.841 32.7124C346.735 32.7124 346.633 32.6687 346.558 32.5911L344 29.9487C343.921 29.8692 343.878 29.7598 343.88 29.6464C343.883 29.533 343.931 29.4256 344.013 29.3496C345.646 27.9353 348.037 27.9353 349.67 29.3496C349.752 29.4257 349.8 29.5331 349.802 29.6465Z"
						fill={statusBarColor()}
					/>
					<rect
						opacity="0.4"
						x="364.191"
						y="18.6249"
						width="27.6"
						height="13.8"
						rx="4.025"
						stroke={statusBarColor()}
						stroke-width="1.15"
					/>
					<path
						opacity="0.5"
						d="M393.516 23.2249V27.8249C394.443 27.4353 395.045 26.529 395.045 25.5249C395.045 24.5208 394.443 23.6145 393.516 23.2249Z"
						fill={statusBarColor()}
					/>
					<rect
						x="365.916"
						y="20.3499"
						width="19.55"
						height="10.35"
						rx="2.3"
						fill={statusBarColor()}
					/>
				</svg>
				<header
					style={{
						"background-color":
							TelegramThemes[props.platform][mode()].secondary_bg_color,
						color: TelegramThemes[props.platform][mode()].text_color,
					}}
				>
					<div>
						<span
							style={{
								color: TelegramThemes[props.platform][mode()].button_color,
							}}
						>
							<FaSolidChevronLeft />
						</span>
					</div>
					<div>
						<h2>{props.project.name}</h2>
						<span
							style={{
								color:
									TelegramThemes[props.platform][mode()].subtitle_text_color,
							}}
						>
							bot
						</span>
					</div>
					<div>
						<span
							style={{
								"background-color": stringToColorDark(props.project.id),
							}}
						>
							{getNameInitials(props.project.name)}
						</span>
					</div>
				</header>
				<div />

				<Show
					when={open()}
					fallback={
						<footer
							style={{
								"background-color":
									TelegramThemes[props.platform][mode()].secondary_bg_color,
								color:
									TelegramThemes[props.platform][mode()].subtitle_text_color,
							}}
						>
							<button
								type="button"
								onClick={() => setOpen(true)}
								style={{
									"background-color":
										TelegramThemes[props.platform][mode()].button_color,
									color:
										TelegramThemes[props.platform][mode()].button_text_color,
								}}
							>
								<BiRegularWindow />
								{props.project.name}
							</button>
							<RiEditorAttachment2 />
							<div
								style={{
									"background-color":
										TelegramThemes[props.platform][mode()].section_bg_color,
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
						classList={{ expanded: expanded(), dark: mode() === "dark" }}
						style={{
							"background-color":
								TelegramThemes[props.platform][mode()].bg_color,
							color: TelegramThemes[props.platform][mode()].text_color,
						}}
					>
						<header
							style={{
								"background-color":
									colorHeader() ??
									TelegramThemes[props.platform][mode()].header_bg_color,
								color:
									colorHeaderText() ??
									TelegramThemes[props.platform][mode()].text_color,
							}}
						>
							<div>
								<span
									style={{
										color:
											colorHeaderText() ??
											TelegramThemes[props.platform][mode()].button_color,
									}}
									onClick={() => onClickBackOrCloseButton()}
									onKeyUp={() => onClickBackOrCloseButton()}
								>
									{backButtonEnabled() ? "Back" : "Close"}
								</span>
							</div>
							<div>
								<h2>{props.project.name}</h2>
								<span
									style={{
										color:
											TelegramThemes[props.platform][mode()]
												.subtitle_text_color,
									}}
								>
									mini app
								</span>
							</div>
							<div
								style={{
									color:
										colorHeaderText() ??
										TelegramThemes[props.platform][mode()].button_color,
								}}
							>
								<CgMoreO />
							</div>
						</header>
						<section
							style={{
								"background-color":
									colorBackground() ??
									TelegramThemes[props.platform][mode()].bg_color,
							}}
						>
							{/* @ts-ignore */}
							<webview ref={webview} src={webAppUrl()} />
						</section>
						<BottomBar platform={props.platform} />
					</section>
				</Show>

				<Show when={popup()}>
					<PopupHandler
						platform={props.platform}
						mode={mode()}
						signalPopup={[popup, setPopup]}
						signalPopupPressId={[popupPressId, setPopupPressID]}
					/>
				</Show>

				<Show when={popupQR()}>
					<PopupQRHandler
						platform={props.platform}
						mode={mode()}
						signalPopupQR={[popupQR, setPopupQR]}
						signalPopupQRData={[popupQRData, setPopupQRData]}
					/>
				</Show>

				<Show when={popupStory()}>
					<PopupStoryHandler
						platform={props.platform}
						mode={mode()}
						signalPopupStory={[popupStory, setPopupStory]}
					/>
				</Show>
			</div>
		</IPhoneFrame>
	);
};
