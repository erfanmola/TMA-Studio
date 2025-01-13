import {
	TelegramThemes,
	type TelegramPlatform,
	type ThemeMode,
} from "./themes";
import hmac from "js-crypto-hmac";

import type {
	Project,
	TelegramButtonMain,
	TelegramButtonSecondary,
	TelegramMethodEvent,
	TelegramPopup,
	TelegramScanQRPopup,
	TelegramStory,
	User,
} from "@renderer/types";
import { buffer2Hex, deserializeObject, ksort } from "./general";
import { batch } from "solid-js";
import { isHexColor, isColorDark } from "./color";
import type { SetStoreFunction } from "solid-js/store";
import type { TMAProjectFrame } from "@renderer/pages/Project";
import type { WebviewTag } from "electron";
import type { MenuMoreStore } from "@renderer/sections/MenuMore";
import { preferences } from "./preferences";

export const TGWebAppVersion = "7.10";

export const tgWebAppData = async (
	platform: TelegramPlatform,
	mode: ThemeMode,
	user: User | undefined,
	token: string | undefined,
): Promise<string> => {
	const webAppData = {
		auth_date: Math.floor(Date.now() / 1000).toString(),
		query_id: "SomeRandomQueryID",
		user: JSON.stringify(
			user ??
				({
					id: 1234567890,
					first_name: "John",
					language_code: "en",
					photo_url: "https://picsum.photos/256/256",
				} as User),
		),
		hash: "SomeFakeHash",
		signature: "SomeFakeSignature",
	};

	webAppData.hash = await tgWebAppDataHash(webAppData, token ?? "Nothing!");

	const extraData = {
		tgWebAppVersion: TGWebAppVersion,
		tgWebAppPlatform: platform,
		tgWebAppThemeParams: JSON.stringify(TelegramThemes[platform][mode]),
	};

	const webAppDataEncoded = new URLSearchParams(webAppData).toString();

	return `#${new URLSearchParams({
		tgWebAppData: webAppDataEncoded,
		...extraData,
	})}`;
};

export const tgWebAppDataHash = async (webAppData: any, token: string) => {
	const initData: any = ksort(deserializeObject(webAppData));
	delete initData.hash;

	const initDataString = Object.entries(initData)
		.map(([key, value]) => {
			value =
				typeof value === "object" ? JSON.stringify(value, null, 0) : value;
			return `${key}=${value}`;
		})
		.join("\n")
		.replace(/\//g, "\\/");

	return buffer2Hex(
		await hmac.compute(
			await hmac.compute(
				new TextEncoder().encode("WebAppData"),
				new TextEncoder().encode(token),
				"SHA-256",
			),
			new TextEncoder().encode(initDataString),
			"SHA-256",
		),
	);
};

export const tgEmitEvent = async (
	eventType: string,
	eventData: any,
	webview: WebviewTag | undefined,
	platform: TelegramPlatform,
) => {
	if (!webview) return;
	let code = "";

	switch (platform) {
		case "android":
		case "ios":
			code = `window.Telegram.WebView.receiveEvent('${eventType}', ${JSON.stringify(eventData)})`;
			break;
		case "tdesktop":
			code = `window.TelegramGameProxy.receiveEvent('${eventType}', ${JSON.stringify(eventData)})`;
			break;
	}

	try {
		return await webview.executeJavaScript(code);
	} catch (e) {}
};

export type TMAProjectInner = {
	webview: WebviewTag | undefined;
	ready: boolean;
	backButton: {
		enabled: boolean;
	};
	settingsButton: {
		enabled: boolean;
	};
	shake: boolean;
	popup: {
		regular: {
			popup: TelegramPopup | undefined;
			press_id: string | undefined;
		};
		qr: {
			popup: TelegramScanQRPopup | undefined;
			data: string | undefined;
		};
		story: {
			popup: TelegramStory | undefined;
		};
	};
	theme: {
		color: {
			header: string | undefined;
			headerText: string | undefined;
			background: string | undefined;
			bottomBar: string | undefined;
		};
	};
	closeConfirmation: {
		enabled: boolean;
	};
	verticalSwipe: {
		enabled: boolean;
	};
	buttonMain: TelegramButtonMain;
	buttonSecondary: TelegramButtonSecondary;
};

export const tgEventHandler = (
	event: TelegramMethodEvent,
	webview: any,
	platform: TelegramPlatform,
	projectFrameStore: [TMAProjectFrame, SetStoreFunction<TMAProjectFrame>],
	projectInnerStore: [TMAProjectInner, SetStoreFunction<TMAProjectInner>],
) => {
	let eventData: any = event.eventData;

	try {
		eventData = JSON.parse(eventData);
	} catch (e) {}

	const [projectFrame, setProjectFrame] = projectFrameStore;
	const [, setProjectInner] = projectInnerStore;

	switch (event.eventType) {
		case "iframe_ready":
			setProjectInner("ready", true);
			break;

		case "iframe_will_reload":
			break;

		case "web_app_ready":
			setProjectInner("ready", true);
			break;

		case "web_app_close":
			// TODO: check if this method respects the enableCloseConfirmation on different clients
			if (webview?.isDevToolsOpened) {
				webview?.closeDevTools();
			}
			webview = undefined;
			setProjectFrame("state", "open", false);
			break;

		case "web_app_expand":
			setProjectFrame("state", "expanded", false);
			break;

		case "web_app_set_header_color": {
			let color = eventData.color;

			if (!isHexColor(eventData.color) && "color_key" in eventData) {
				switch (eventData.color_key) {
					case "bg_color":
						color = TelegramThemes[platform][projectFrame.state.mode].bg_color;
						break;
					case "secondary_bg_color":
						color =
							TelegramThemes[platform][projectFrame.state.mode]
								.secondary_bg_color;
						break;
				}
			}

			if (color) {
				batch(() => {
					setProjectInner("theme", "color", "header", color);
					setProjectInner(
						"theme",
						"color",
						"headerText",
						isColorDark(color) ? "#ffffff" : "#000000",
					);
				});
			}
			break;
		}

		case "web_app_set_background_color": {
			let color = eventData.color;

			if (!isHexColor(eventData.color) && "color_key" in eventData) {
				switch (eventData.color_key) {
					case "bg_color":
						color = TelegramThemes[platform][projectFrame.state.mode].bg_color;
						break;
					case "secondary_bg_color":
						color =
							TelegramThemes[platform][projectFrame.state.mode]
								.secondary_bg_color;
						break;
				}
			}

			if (color) {
				setProjectInner("theme", "color", "background", color);
			}
			break;
		}

		case "web_app_set_bottom_bar_color": {
			let color = eventData.color;

			if (!isHexColor(eventData.color) && "color_key" in eventData) {
				switch (eventData.color_key) {
					case "bg_color":
						color = TelegramThemes[platform][projectFrame.state.mode].bg_color;
						break;
					case "secondary_bg_color":
						color =
							TelegramThemes[platform][projectFrame.state.mode]
								.secondary_bg_color;
						break;
					case "bottom_bar_bg_color":
						color =
							TelegramThemes[platform][projectFrame.state.mode]
								.bottom_bar_bg_color;
						break;
				}
			}

			if (color) {
				setProjectInner("theme", "color", "bottomBar", color);
			}
			break;
		}

		case "web_app_trigger_haptic_feedback": {
			setProjectInner("shake", true);
			if (preferences.project.macos_vibrate_on_haptic) {
				window.api.haptic.vibrate();
			}
			let shakeTimeout = 2e2;

			switch (eventData.type) {
				case "notification":
					switch (eventData.notification_type) {
						case "success":
							shakeTimeout = 1e2;
							break;
						case "warning":
							shakeTimeout = 1e2;
							break;
						case "error":
							shakeTimeout = 3e2;
							break;
					}
					break;

				case "impact":
					switch (eventData.impact_style) {
						case "light":
							shakeTimeout = 1e2;
							break;
						case "medium":
							shakeTimeout = 2e2;
							break;
						case "heavy":
							shakeTimeout = 3e2;
							break;
						case "rigid":
							shakeTimeout = 4e2;
							break;
						case "soft":
							shakeTimeout = 150;
							break;
					}
					break;

				case "selection_change":
					shakeTimeout = 5e1;
					break;
			}

			setTimeout(() => setProjectInner("shake", false), shakeTimeout);
			break;
		}

		case "web_app_request_theme":
			tgEmitEvent(
				"theme_changed",
				{
					theme_params: TelegramThemes[platform][projectFrame.state.mode],
				},
				webview,
				platform,
			);
			break;

		case "web_app_request_viewport": {
			const { width, height } = webview.getBoundingClientRect();

			tgEmitEvent(
				"viewport_changed",
				{
					height: Math.round(
						height / (width / preferences.viewport[projectFrame.platform]),
					),
					width: Math.round(
						width / (width / preferences.viewport[projectFrame.platform]),
					),
					is_expanded: projectFrame.state.expanded,
					is_state_stable: true,
				},
				webview,
				platform,
			);
			break;
		}

		case "web_app_setup_swipe_behavior":
			setProjectInner(
				"verticalSwipe",
				"enabled",
				eventData.allow_vertical_swipe,
			);
			break;

		case "web_app_setup_closing_behavior":
			setProjectInner(
				"closeConfirmation",
				"enabled",
				eventData.need_confirmation,
			);
			break;

		case "web_app_setup_back_button":
			setProjectInner("backButton", "enabled", eventData.is_visible);
			break;

		case "web_app_setup_main_button":
			setProjectInner("buttonMain", eventData);
			break;

		case "web_app_setup_secondary_button":
			setProjectInner("buttonSecondary", eventData);
			break;

		case "web_app_setup_settings_button":
			setProjectInner("settingsButton", "enabled", eventData.is_visible);
			break;

		case "web_app_biometry_get_info":
			break;

		case "web_app_biometry_request_access":
			break;

		case "web_app_biometry_request_auth":
			break;

		case "web_app_biometry_update_token":
			break;

		case "web_app_biometry_open_settings":
			break;

		case "web_app_open_scan_qr_popup":
			setProjectInner("popup", "qr", "popup", eventData);
			break;

		case "web_app_close_scan_qr_popup":
			setProjectInner("popup", "qr", "popup", undefined);
			break;

		case "web_app_invoke_custom_method":
			break;

		case "web_app_data_send":
			break;

		case "web_app_switch_inline_query":
			break;

		case "web_app_open_link":
			break;

		case "web_app_open_tg_link":
			break;

		case "web_app_open_invoice":
			break;

		case "web_app_open_popup":
			setProjectInner("popup", "regular", "popup", eventData);
			break;

		case "web_app_read_text_from_clipboard":
			setProjectInner("popup", "regular", "popup", {
				title: "Mock Clipboard Request",
				message: "Allow pasting into the app?",
				buttons: [
					{
						id: `tg_webapp_clipboard_cancel_${eventData.req_id}`,
						type: "default",
						text: "Cancel",
					},
					{
						id: `tg_webapp_clipboard_confirm_${eventData.req_id}`,
						type: "default",
						text: "Allow",
					},
				],
			} as TelegramPopup);
			break;

		case "web_app_request_write_access":
			setProjectInner("popup", "regular", "popup", {
				title: "Mock Write Request",
				message: "Allow write access to user?",
				buttons: [
					{
						id: "tg_webapp_write_access_cancel",
						type: "default",
						text: "Cancel",
					},
					{
						id: "tg_webapp_write_access_confirm",
						type: "default",
						text: "Allow",
					},
				],
			} as TelegramPopup);
			break;

		case "web_app_request_phone":
			setProjectInner("popup", "regular", "popup", {
				title: "Mock Contact Request",
				message: "Allow sharing your contact info with bot?",
				buttons: [
					{
						id: "tg_webapp_contact_cancel",
						type: "default",
						text: "Cancel",
					},
					{
						id: "tg_webapp_contact_confirm",
						type: "default",
						text: "Allow",
					},
				],
			} as TelegramPopup);
			break;

		case "web_app_share_to_story":
			setProjectInner("popup", "story", "popup", eventData);
			break;
	}
};

export const generateProjectFrame = (
	platform: TelegramPlatform,
	project: Project,
): TMAProjectFrame => {
	return {
		platform: platform,
		inspectElement: {
			open: false,
		},
		state: {
			open: project.settings[platform].open,
			expanded: project.settings[platform].expanded,
			mode: project.settings[platform].mode,
		},
		window: {
			floating: project.settings[platform].floating,
		},
	};
};

export const generateProjectInner = (
	projectFrame: TMAProjectFrame,
): TMAProjectInner => {
	return {
		webview: undefined,
		backButton: {
			enabled: false,
		},
		buttonMain: {
			text: "Button",
			color:
				TelegramThemes[projectFrame.platform][projectFrame.state.mode]
					.button_color,
			text_color:
				TelegramThemes[projectFrame.platform][projectFrame.state.mode]
					.button_text_color,
			is_active: true,
			is_progress_visible: false,
			has_shine_effect: false,
			is_visible: false,
		},
		buttonSecondary: {
			text: "Button",
			color:
				TelegramThemes[projectFrame.platform][projectFrame.state.mode]
					.button_color,
			text_color:
				TelegramThemes[projectFrame.platform][projectFrame.state.mode]
					.button_text_color,
			is_active: true,
			is_progress_visible: false,
			has_shine_effect: false,
			is_visible: false,
		},
		closeConfirmation: {
			enabled: false,
		},
		popup: {
			regular: {
				popup: undefined,
				press_id: undefined,
			},
			qr: {
				popup: undefined,
				data: undefined,
			},
			story: {
				popup: undefined,
			},
		},
		ready: false,
		settingsButton: {
			enabled: false,
		},
		shake: false,
		theme: {
			color: {
				background: undefined,
				bottomBar: undefined,
				header: undefined,
				headerText: undefined,
			},
		},
		verticalSwipe: {
			enabled: false,
		},
	};
};

export const generateProjectMenuMore = (): MenuMoreStore => {
	return {
		open: false,
		reload: {
			clicked: false,
		},
		settings: {
			clicked: false,
		},
		closeOrBack: {
			clicked: false,
		},
	};
};
