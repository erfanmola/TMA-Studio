import "../scss/sections/_viewport-android.scss";

import { AndroidFrame } from "@renderer/components/DeviceFrames";
import type {
	Project,
	TelegramPopup,
	TelegramScanQRPopup,
	TelegramMethodEvent,
	TelegramStory,
	TelegramButtonMain,
	TelegramButtonSecondary,
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
import { RiEditorAttachment2, RiSystemCloseFill } from "solid-icons/ri";
import { TbSticker } from "solid-icons/tb";
import { TiMicrophoneOutline } from "solid-icons/ti";
import { BiRegularWindow } from "solid-icons/bi";

import webviewStyle from "../scss/_webview.scss?inline";
import { PopupStoryHandler } from "./PopupStory";
import { createStore } from "solid-js/store";
import { MenuMore } from "./MenuMore";
import { IoArrowBackOutline } from "solid-icons/io";
import { FiMoreVertical } from "solid-icons/fi";
import { isColorDark } from "@renderer/utils/color";
import { FaSolidAngleDown } from "solid-icons/fa";

export const ViewportAndroid: Component<{
	project: Project;
	platform: TelegramPlatform;
	signalMode: Signal<ThemeMode>;
	signalExpanded: Signal<boolean>;
	signalInspectElement: Signal<boolean>;
	signalOpen: Signal<boolean>;
	placeholder: boolean;
}> = (props) => {
	const [ready, setReady] = createSignal(false);

	const [openMore, setOpenMore] = createSignal(false);
	const [settingsButtonClicked, setSettingsButtonClicked] = createSignal(false);
	const [reloadButtonClicked, setReloadButtonClicked] = createSignal(false);

	const [mode] = props.signalMode;
	const [expanded, setExpanded] = props.signalExpanded;
	const [inspectElement, setInspectElement] = props.signalInspectElement;
	const [open, setOpen] = props.signalOpen;

	const [backButtonEnabled, setBackButtonEnabled] = createSignal(false);
	const [settingsButtonEnabled, setSettingsButtonEnabled] = createSignal(false);
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

	const [buttonMain, setButtonMain] = createStore<TelegramButtonMain>({
		text: "Button",
		color: TelegramThemes[props.platform][mode()].button_color,
		text_color: TelegramThemes[props.platform][mode()].button_text_color,
		is_active: true,
		is_progress_visible: false,
		has_shine_effect: false,
		is_visible: false,
	});

	const [buttonSecondary, setButtonSecondary] =
		createStore<TelegramButtonSecondary>({
			text: "Button",
			color: TelegramThemes[props.platform][mode()].button_color,
			text_color: TelegramThemes[props.platform][mode()].button_text_color,
			is_active: true,
			is_progress_visible: false,
			has_shine_effect: false,
			is_visible: false,
		});

	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	let webview: any;

	const [statusBarColor, setStatusBarColor] = createSignal<"black" | "white">(
		"white",
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
	const [colorBottomBar, setColorBottomBar] = createSignal<string | undefined>(
		undefined,
	);

	// Set Statusbar color based on header color in fullscreen
	createEffect(() => {
		if (expanded() && colorHeader()) {
			setStatusBarColor(isColorDark(colorHeader() ?? "") ? "white" : "black");
		} else {
			setStatusBarColor(expanded() && mode() === "light" ? "black" : "white");
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

	// Detect the reload button click from child menu component
	createEffect(
		on(reloadButtonClicked, () => {
			if (reloadButtonClicked()) {
				setReloadButtonClicked(false);
				if (webview) {
					webview.reload();
				}
			}
		}),
	);

	// Detect the settings button click from child menu component
	createEffect(
		on(settingsButtonClicked, () => {
			if (settingsButtonClicked()) {
				setSettingsButtonClicked(false);
				tgEmitEvent("settings_button_pressed", {}, webview, props.platform);
			}
		}),
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
						signalSettingsButtonEnabled: [
							settingsButtonEnabled,
							setSettingsButtonEnabled,
						],
						signalShake: [shake, setShake],
						signalPopup: [popup, setPopup],
						signalPopupQR: [popupQR, setPopupQR],
						signalColorHeader: [colorHeader, setColorHeader],
						signalColorHeaderText: [colorHeaderText, setColorHeaderText],
						signalColorBackground: [colorBackground, setColorBackground],
						signalColorBottomBar: [colorBottomBar, setColorBottomBar],
						signalCloseConfirmationEnabled: [
							closeConfirmationEnabled,
							setCloseConfirmationEnabled,
						],
						signalVerticalSwipeEnabled: [
							verticalSwipeEnabled,
							setVerticalSwipeEnabled,
						],
						signalPopupStory: [popupStory, setPopupStory],
						storeButtonMain: [buttonMain, setButtonMain],
						storeButtonSecondary: [buttonSecondary, setButtonSecondary],
						signalReady: [ready, setReady],
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
			setReady(true);
		});

		onCleanup(() => {
			if (open() && webview?.isDevToolsOpened) {
				try {
					webview?.closeDevTools();
				} catch (e) {}
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
					setSettingsButtonEnabled(false);
					setCloseConfirmationEnabled(false);
				}
			},
			{
				defer: true,
			},
		),
	);

	return (
		<AndroidFrame
			classList={{ shake: shake(), placeholder: props.placeholder }}
		>
			<Show when={!props.placeholder}>
				<div
					id="viewport-telegram-android"
					classList={{
						expanded: expanded(),
						dark: mode() === "dark",
					}}
				>
					{/* biome-ignore lint/a11y/noSvgWithoutTitle: <explanation> */}
					<svg
						width="1100"
						height="128"
						viewBox="0 0 1100 128"
						fill={statusBarColor()}
						xmlns="http://www.w3.org/2000/svg"
					>
						<path d="M71.2225 79.4443C70.1986 79.4443 69.1604 79.2913 68.108 78.9852C67.0557 78.6791 66.0602 78.2199 65.1216 77.6077C64.2114 76.9676 63.4008 76.1606 62.6897 75.1866C61.9786 74.2126 61.4525 73.0577 61.1111 71.722L65.3775 70.0523C65.7473 71.5272 66.4157 72.7377 67.3828 73.6839C68.3782 74.6022 69.6439 75.0614 71.1799 75.0614C71.9478 75.0614 72.6731 74.9362 73.3557 74.6857C74.0383 74.4074 74.6214 74.0456 75.1049 73.6004C75.5885 73.1273 75.9724 72.5707 76.2569 71.9307C76.5413 71.2906 76.6835 70.581 76.6835 69.8018C76.6835 69.0226 76.5413 68.313 76.2569 67.6729C76.0009 67.0051 75.6311 66.4346 75.1476 65.9615C74.6641 65.4884 74.081 65.1267 73.3984 64.8762C72.7158 64.5979 71.9762 64.4588 71.1799 64.4588C70.2412 64.4588 69.388 64.6675 68.62 65.0849C67.8521 65.4745 67.2121 65.9893 66.7001 66.6294L62.0071 64.584L63.7563 50.2246H79.67V54.4406H67.7241L66.6575 61.8707L66.9135 61.9542C67.5392 61.4811 68.2645 61.0776 69.0893 60.7437C69.9142 60.4097 70.9239 60.2428 72.1185 60.2428C73.3415 60.2428 74.5076 60.4793 75.6169 60.9524C76.7546 61.3976 77.7501 62.0377 78.6034 62.8726C79.4567 63.7074 80.1393 64.7092 80.6513 65.878C81.1632 67.0468 81.4192 68.3408 81.4192 69.7601C81.4192 71.1515 81.1632 72.4455 80.6513 73.6421C80.1393 74.8109 79.4282 75.8267 78.5181 76.6893C77.6079 77.552 76.5271 78.2338 75.2756 78.7347C74.0526 79.2078 72.7015 79.4443 71.2225 79.4443Z" />
						<path d="M88.8194 79.0269C87.9092 79.0269 87.1271 78.7208 86.4729 78.1086C85.8472 77.4685 85.5343 76.7033 85.5343 75.8127C85.5343 74.9222 85.8472 74.157 86.4729 73.5169C87.1271 72.8769 87.9092 72.5568 88.8194 72.5568C89.7296 72.5568 90.5118 72.8769 91.1659 73.5169C91.8201 74.157 92.1472 74.9222 92.1472 75.8127C92.1472 76.7033 91.8201 77.4685 91.1659 78.1086C90.5118 78.7208 89.7296 79.0269 88.8194 79.0269ZM88.8194 64.3753C87.9092 64.3753 87.1271 64.0692 86.4729 63.4569C85.8472 62.8169 85.5343 62.0516 85.5343 61.1611C85.5343 60.2706 85.8472 59.5192 86.4729 58.907C87.1271 58.267 87.9092 57.9469 88.8194 57.9469C89.7296 57.9469 90.5118 58.267 91.1659 58.907C91.8201 59.5192 92.1472 60.2706 92.1472 61.1611C92.1472 62.0516 91.8201 62.8169 91.1659 63.4569C90.5118 64.0692 89.7296 64.3753 88.8194 64.3753Z" />
						<path d="M103.111 78.7765V55.8181L97.6925 58.1139L95.9006 54.1484L104.476 50.2246H107.847V78.7765H103.111Z" />
						<path d="M122.962 79.4443C121.938 79.4443 120.914 79.3052 119.89 79.0269C118.867 78.7486 117.899 78.3173 116.989 77.7329C116.108 77.1207 115.311 76.3554 114.6 75.4371C113.889 74.5187 113.349 73.4195 112.979 72.1394L117.416 70.3445C117.814 71.8472 118.497 73.0021 119.464 73.8091C120.431 74.6161 121.597 75.0196 122.962 75.0196C123.645 75.0196 124.299 74.9083 124.925 74.6857C125.579 74.4631 126.148 74.157 126.631 73.7674C127.115 73.3499 127.499 72.8769 127.783 72.3481C128.068 71.7915 128.21 71.1793 128.21 70.5114C128.21 69.8436 128.054 69.2313 127.741 68.6748C127.456 68.1182 127.058 67.6451 126.546 67.2555C126.034 66.8659 125.423 66.5598 124.712 66.3372C124.029 66.1146 123.289 66.0032 122.493 66.0032H119.976V61.7038H122.237C122.92 61.7038 123.545 61.6203 124.114 61.4533C124.712 61.2585 125.238 60.9941 125.693 60.6602C126.148 60.3263 126.503 59.9088 126.759 59.4079C127.015 58.8792 127.143 58.2809 127.143 57.613C127.143 56.472 126.717 55.5815 125.863 54.9415C125.039 54.2736 123.986 53.9396 122.706 53.9396C121.995 53.9396 121.369 54.037 120.829 54.2318C120.317 54.4266 119.876 54.691 119.507 55.025C119.137 55.3589 118.824 55.7346 118.568 56.152C118.34 56.5416 118.155 56.9451 118.013 57.3625L113.662 55.5676C113.889 54.8997 114.245 54.2179 114.728 53.5222C115.212 52.7987 115.823 52.1447 116.563 51.5603C117.302 50.9759 118.17 50.5028 119.165 50.1411C120.189 49.7515 121.369 49.5567 122.706 49.5567C124.072 49.5567 125.323 49.7515 126.461 50.1411C127.598 50.5307 128.58 51.0733 129.405 51.769C130.229 52.4647 130.869 53.2857 131.324 54.2318C131.78 55.178 132.007 56.2077 132.007 57.3208C132.007 58.1278 131.893 58.8653 131.666 59.5331C131.467 60.201 131.182 60.7993 130.812 61.3281C130.443 61.829 130.03 62.2603 129.575 62.6221C129.12 62.9839 128.651 63.29 128.167 63.5404V63.7909C128.821 64.0692 129.447 64.4309 130.045 64.8762C130.642 65.2936 131.154 65.7945 131.58 66.3789C132.035 66.9633 132.391 67.6312 132.647 68.3826C132.903 69.1061 133.031 69.8992 133.031 70.7619C133.031 72.0142 132.775 73.183 132.263 74.2683C131.751 75.3258 131.04 76.2441 130.13 77.0233C129.248 77.7746 128.196 78.359 126.973 78.7765C125.75 79.2217 124.413 79.4443 122.962 79.4443Z" />
						<path d="M147.179 78.7765V48.8888H157.76C159.125 48.8888 160.405 49.1114 161.6 49.5567C162.823 50.0019 163.89 50.6281 164.8 51.4351C165.71 52.2421 166.421 53.2161 166.933 54.3571C167.473 55.4702 167.743 56.7086 167.743 58.0722C167.743 59.4079 167.473 60.6463 166.933 61.7872C166.421 62.9004 165.71 63.8605 164.8 64.6675C163.89 65.4745 162.823 66.1006 161.6 66.5459C160.405 66.9912 159.125 67.2138 157.76 67.2138H152V78.7765H147.179ZM157.888 62.7056C158.685 62.7056 159.396 62.5804 160.021 62.3299C160.647 62.0516 161.173 61.6898 161.6 61.2446C162.027 60.7993 162.354 60.2984 162.581 59.7419C162.809 59.1853 162.922 58.6287 162.922 58.0722C162.922 57.4878 162.809 56.9173 162.581 56.3607C162.354 55.8041 162.027 55.3171 161.6 54.8997C161.173 54.4545 160.647 54.0927 160.021 53.8144C159.396 53.5361 158.685 53.397 157.888 53.397H152V62.7056H157.888Z" />
						<path d="M171.845 48.8888H176.666L186.649 65.878H186.905L196.888 48.8888H201.667V78.7765H196.888V62.5386L197.144 57.5295H196.888L188.185 72.4316H185.326L176.666 57.5295H176.41L176.666 62.5386V78.7765H171.845V48.8888Z" />
						<path
							fill-rule="evenodd"
							clip-rule="evenodd"
							d="M753.834 44.8065C754.648 43.9929 754.648 42.6738 753.834 41.8602C753.021 41.0466 751.702 41.0466 750.888 41.8602L744.638 48.1102C743.824 48.9238 743.824 50.2429 744.638 51.0565C745.452 51.8701 746.771 51.8701 747.584 51.0565L753.834 44.8065ZM783.001 41.8602C782.187 41.0466 780.868 41.0466 780.055 41.8602C779.241 42.6738 779.241 43.9929 780.055 44.8065L786.305 51.0565C787.118 51.8701 788.437 51.8701 789.251 51.0565C790.065 50.2429 790.065 48.9238 789.251 48.1102L783.001 41.8602ZM766.945 49.5835C757.74 49.5835 750.278 57.0454 750.278 66.2501C750.278 75.4549 757.74 82.9168 766.945 82.9168C776.149 82.9168 783.611 75.4549 783.611 66.2501C783.611 57.0454 776.149 49.5835 766.945 49.5835ZM746.111 66.2501C746.111 54.7442 755.439 45.4168 766.945 45.4168C778.45 45.4168 787.778 54.7442 787.778 66.2501C787.778 77.7561 778.45 87.0835 766.945 87.0835C755.439 87.0835 746.111 77.7561 746.111 66.2501ZM766.944 53.75C768.095 53.75 769.028 54.6828 769.028 55.8334V65.1354L774.35 68.6832C775.307 69.3213 775.566 70.6148 774.928 71.5722C774.29 72.5296 772.996 72.7884 772.039 72.1502L766.716 68.6023C766.146 68.2217 765.677 67.7056 765.354 67.1009C765.03 66.4963 764.861 65.8211 764.861 65.1354V55.8334C764.861 54.6828 765.794 53.75 766.944 53.75Z"
						/>
						<path
							fill-rule="evenodd"
							clip-rule="evenodd"
							d="M977.473 48.8892C977.473 47.3704 976.241 46.1392 974.723 46.1392C973.204 46.1392 971.973 47.3704 971.973 48.8892V79.4447C971.973 80.9635 973.204 82.1947 974.723 82.1947C976.241 82.1947 977.473 80.9635 977.473 79.4447V48.8892ZM957 65.083C957 63.5642 955.768 62.333 954.25 62.333C952.731 62.333 951.5 63.5642 951.5 65.083V79.4441C951.5 80.9629 952.731 82.1941 954.25 82.1941C955.768 82.1941 957 80.9629 957 79.4441V65.083ZM944.167 70.5836C945.686 70.5836 946.917 71.8148 946.917 73.3336V79.4447C946.917 80.9635 945.686 82.1947 944.167 82.1947C942.648 82.1947 941.417 80.9635 941.417 79.4447V73.3336C941.417 71.8148 942.648 70.5836 944.167 70.5836ZM967.389 57.139C967.389 55.6202 966.158 54.389 964.639 54.389C963.12 54.389 961.889 55.6202 961.889 57.139V79.4446C961.889 80.9634 963.12 82.1946 964.639 82.1946C966.158 82.1946 967.389 80.9634 967.389 79.4446V57.139Z"
						/>
						<path
							fill-rule="evenodd"
							clip-rule="evenodd"
							d="M884.504 52.6549C887.83 51.2735 891.396 50.5646 894.996 50.5693L895 50.5693C902.573 50.5693 909.424 53.6443 914.378 58.6199C915.331 59.5765 916.879 59.5798 917.835 58.6272C918.792 57.6746 918.795 56.1269 917.843 55.1703C912.008 49.3113 903.927 45.6809 895.001 45.6804C890.755 45.6751 886.55 46.5111 882.629 48.1401C878.707 49.7693 875.147 52.1595 872.154 55.1725C871.203 56.1303 871.208 57.6781 872.166 58.6294C873.124 59.5808 874.672 59.5756 875.623 58.6177C878.161 56.063 881.179 54.0363 884.504 52.6549ZM895.001 45.6804L895 45.6804V48.1249L895.003 45.6804L895.001 45.6804ZM887.859 61.1912C890.115 60.228 892.543 59.7329 894.997 59.736H895.003C897.456 59.7329 899.884 60.228 902.14 61.1912C904.396 62.1544 906.433 63.5657 908.128 65.3395C909.06 66.3157 910.608 66.351 911.584 65.4184C912.56 64.4859 912.595 62.9385 911.663 61.9624C909.511 59.71 906.924 57.918 904.06 56.6949C901.196 55.4723 898.114 54.8436 895 54.8471C891.886 54.8436 888.803 55.4723 885.939 56.6949C883.075 57.918 880.488 59.71 878.336 61.9624C877.404 62.9385 877.439 64.4859 878.415 65.4184C879.391 66.351 880.939 66.3157 881.871 65.3395C883.566 63.5657 885.603 62.1544 887.859 61.1912ZM895 54.8471L894.997 54.8471L895 57.2916L895.003 54.8471L895 54.8471ZM891.277 69.704C892.446 69.1744 893.714 68.9012 894.997 68.9027H895C897.701 68.9027 900.124 70.0892 901.779 71.9754C902.669 72.9902 904.214 73.091 905.228 72.2007C906.243 71.3103 906.344 69.7658 905.454 68.7511C902.911 65.8526 899.169 64.0142 895.001 64.0138L895.002 64.0138L895 66.4582V64.0138H895.001C893.021 64.0117 891.063 64.4336 889.259 65.251C887.455 66.0686 885.847 67.263 884.543 68.7538C883.654 69.77 883.757 71.3143 884.774 72.2031C885.79 73.092 887.334 72.9887 888.223 71.9726C889.067 71.007 890.109 70.2335 891.277 69.704ZM898.333 76.9999C898.333 78.6874 896.965 80.0554 895.278 80.0554C893.59 80.0554 892.222 78.6874 892.222 76.9999C892.222 75.3123 893.59 73.9443 895.278 73.9443C896.965 73.9443 898.333 75.3123 898.333 76.9999Z"
						/>
						<path
							fill-rule="evenodd"
							clip-rule="evenodd"
							d="M830.191 42.9899C830.888 42.6495 831.722 42.7229 832.345 43.1797L845.566 52.8693C846.092 53.2546 846.398 53.8622 846.389 54.5043C846.38 55.1465 846.057 55.7458 845.521 56.117L833.892 64.1666L845.521 72.2162C846.057 72.5874 846.38 73.1867 846.389 73.8289C846.398 74.471 846.092 75.0786 845.566 75.4639L832.345 85.1535C831.722 85.6103 830.888 85.6837 830.191 85.3433C829.495 85.0029 829.055 84.307 829.055 83.5458V67.5146L819.079 74.4195C818.152 75.0611 816.868 74.8469 816.212 73.9412C815.555 73.0355 815.774 71.7812 816.701 71.1396L826.775 64.1666L816.701 57.1936C815.774 56.552 815.555 55.2977 816.212 54.392C816.868 53.4863 818.152 53.2721 819.079 53.9137L829.055 60.8186V44.7874C829.055 44.0262 829.495 43.3303 830.191 42.9899ZM833.168 68.5912L840.841 73.9026L833.168 79.5264V68.5912ZM833.168 59.742V48.8068L840.841 54.4306L833.168 59.742Z"
						/>
						<path
							fill-rule="evenodd"
							clip-rule="evenodd"
							d="M1002.71 50.1386C1004 48.8493 1005.75 48.125 1007.57 48.125H1035.07C1036.89 48.125 1038.64 48.8493 1039.93 50.1386C1041.22 51.428 1041.94 53.1766 1041.94 55V55.3932C1042.9 55.7318 1043.78 56.2817 1044.51 57.0136C1045.8 58.303 1046.53 60.0516 1046.53 61.875V66.4583C1046.53 68.2817 1045.8 70.0304 1044.51 71.3197C1043.78 72.0517 1042.9 72.6015 1041.94 72.9402V73.3333C1041.94 75.1567 1041.22 76.9054 1039.93 78.1947C1038.64 79.484 1036.89 80.2083 1035.07 80.2083H1007.57C1005.75 80.2083 1004 79.484 1002.71 78.1947C1001.42 76.9054 1000.69 75.1567 1000.69 73.3333V55C1000.69 53.1766 1001.42 51.428 1002.71 50.1386ZM1007.57 52.7083C1006.96 52.7083 1006.38 52.9498 1005.95 53.3795C1005.52 53.8093 1005.28 54.3922 1005.28 55V73.3333C1005.28 73.9411 1005.52 74.524 1005.95 74.9538C1006.38 75.3836 1006.96 75.625 1007.57 75.625H1035.07C1035.68 75.625 1036.26 75.3836 1036.69 74.9538C1037.12 74.524 1037.36 73.9411 1037.36 73.3333V71.0417C1037.36 69.776 1038.39 68.75 1039.65 68.75C1040.26 68.75 1040.84 68.5086 1041.27 68.0788C1041.7 67.649 1041.94 67.0661 1041.94 66.4583V61.875C1041.94 61.2672 1041.7 60.6843 1041.27 60.2545C1040.84 59.8248 1040.26 59.5833 1039.65 59.5833C1038.39 59.5833 1037.36 58.5573 1037.36 57.2917V55C1037.36 54.3922 1037.12 53.8093 1036.69 53.3795C1036.26 52.9498 1035.68 52.7083 1035.07 52.7083H1007.57ZM1012.15 57.2917C1013.42 57.2917 1014.44 58.3177 1014.44 59.5833V68.75C1014.44 70.0157 1013.42 71.0417 1012.15 71.0417C1010.89 71.0417 1009.86 70.0157 1009.86 68.75V59.5833C1009.86 58.3177 1010.89 57.2917 1012.15 57.2917ZM1021.32 57.2917C1022.59 57.2917 1023.61 58.3177 1023.61 59.5833V68.75C1023.61 70.0157 1022.59 71.0417 1021.32 71.0417C1020.05 71.0417 1019.03 70.0157 1019.03 68.75V59.5833C1019.03 58.3177 1020.05 57.2917 1021.32 57.2917ZM1030.49 57.2917C1031.75 57.2917 1032.78 58.3177 1032.78 59.5833V68.75C1032.78 70.0157 1031.75 71.0417 1030.49 71.0417C1029.22 71.0417 1028.19 70.0157 1028.19 68.75V59.5833C1028.19 58.3177 1029.22 57.2917 1030.49 57.2917Z"
						/>
					</svg>

					<header
						style={{
							"background-color":
								TelegramThemes[props.platform][mode()].header_bg_color,
							color: TelegramThemes[props.platform][mode()].button_text_color,
						}}
					>
						<div>
							<span
								style={{
									color:
										TelegramThemes[props.platform][mode()].button_text_color,
								}}
							>
								<IoArrowBackOutline />
							</span>
						</div>
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
											TelegramThemes[props.platform][mode()].button_text_color,
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
										TelegramThemes[props.platform][mode()].button_text_color,
								}}
							>
								<FiMoreVertical />
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
							<Show when={expanded()}>
								<header
									style={{
										"background-color":
											colorHeader() ??
											(expanded()
												? TelegramThemes[props.platform][mode()].bg_color
												: TelegramThemes[props.platform][mode()]
														.header_bg_color),
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
											{backButtonEnabled() ? (
												<IoArrowBackOutline />
											) : (
												<RiSystemCloseFill />
											)}
										</span>
									</div>
									<div>
										<h2>{props.project.name}</h2>
									</div>
									<div
										style={{
											color:
												colorHeaderText() ??
												TelegramThemes[props.platform][mode()].button_color,
										}}
										onClick={() => setExpanded(false)}
										onKeyUp={() => setExpanded(false)}
									>
										<FaSolidAngleDown />
									</div>
									<div
										style={{
											color:
												colorHeaderText() ??
												TelegramThemes[props.platform][mode()].button_color,
										}}
									>
										<MenuMore
											signalOpen={[openMore, setOpenMore]}
											signalSettingsButtonEnabled={[
												settingsButtonEnabled,
												setSettingsButtonEnabled,
											]}
											mode={mode()}
											platform={props.platform}
											signalReloadButtonClicked={[
												reloadButtonClicked,
												setReloadButtonClicked,
											]}
											signalSettingsButtonClicked={[
												settingsButtonClicked,
												setSettingsButtonClicked,
											]}
										/>
									</div>
								</header>
							</Show>

							<section
								style={{
									"background-color":
										colorBackground() ??
										TelegramThemes[props.platform][mode()].bg_color,
								}}
							>
								<Show when={!ready()}>
									<div
										style={{
											"background-color":
												colorBackground() ??
												TelegramThemes[props.platform][mode()].bg_color,
										}}
									/>
								</Show>
								{/* @ts-ignore */}
								<webview ref={webview} src={webAppUrl()} />
							</section>
							<BottomBar
								platform={props.platform}
								mode={mode()}
								webview={webview}
								signalColorBottomBar={[colorBottomBar, setColorBottomBar]}
								buttonMain={buttonMain}
								buttonSecondary={buttonSecondary}
							/>
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
			</Show>
		</AndroidFrame>
	);
};
