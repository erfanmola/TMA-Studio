import { TelegramThemes, type TelegramPlatform, type ThemeMode } from "./themes";
import hmac from 'js-crypto-hmac';

import type { TelegramMethodEvent, TelegramPopup, TelegramScanQRPopup, User } from "@renderer/types";
import { buffer2Hex, deserializeObject, ksort } from "./general";
import { batch, type Signal } from "solid-js";
import { isHexColor, isColorDark } from "./color";

export const TGWebAppVersion = '7.10';

export const tgWebAppData = async (platform: TelegramPlatform, mode: ThemeMode, user: User | undefined, token: string | undefined): Promise<string> => {
	const webAppData = {
        auth_date: Math.floor(Date.now() / 1000).toString(),
        query_id: 'SomeRandomQueryID',
        user: JSON.stringify(user ?? {
            id: 1234567890,
            first_name: 'John',
            language_code: 'en',
        } as User),
        hash: '',
	};

    webAppData.hash = await tgWebAppDataHash(webAppData, token ?? 'Nothing!');

    const extraData = {
        tgWebAppVersion: TGWebAppVersion,
        tgWebAppPlatform: platform,
        tgWebAppThemeParams: JSON.stringify(TelegramThemes[platform][mode]),
    };

    const webAppDataEncoded = new URLSearchParams(webAppData).toString();

	return `#${new URLSearchParams({
        tgWebAppData: webAppDataEncoded,
        ...extraData
    })}`;
};

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export const tgWebAppDataHash = async (webAppData: any, token: string) => {
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    const initData: any = ksort(deserializeObject(webAppData));
    // biome-ignore lint/performance/noDelete: <explanation>
    delete initData.hash;

    const initDataString = Object.entries(initData)
    .map(([key, value]) => {
        value = typeof value === 'object' ? JSON.stringify(value, null, 0) : value;
        return `${key}=${value}`;
    })
    .join('\n').replace(/\//g, "\\/");

    return buffer2Hex(await hmac.compute(await hmac.compute(new TextEncoder().encode('WebAppData'), new TextEncoder().encode(token), 'SHA-256'), new TextEncoder().encode(initDataString), 'SHA-256'));
}

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export const tgEmitEvent = async (eventType: string, eventData: any, webview: any, platform: TelegramPlatform) => {
    if (!webview) return;
    let code = '';

    switch (platform) {
        case 'android':
        case 'ios':
            code = `window.Telegram.WebView.receiveEvent('${eventType}', ${JSON.stringify(eventData)})`;
            break;
        case 'tdesktop':
            code = `window.TelegramGameProxy.receiveEvent('${eventType}', ${JSON.stringify(eventData)})`;
            break;
    }

    return await webview.executeJavaScript(code);
};

export type TGEventHandlerSignals = {
    signalMode: Signal<ThemeMode>;
    signalExpanded: Signal<boolean>; signalOpen: Signal<boolean>;
    signalBackButtonEnabled: Signal<boolean>;
    signalShake: Signal<boolean>;
    signalPopup: Signal<TelegramPopup | undefined>;
    signalPopupQR: Signal<TelegramScanQRPopup | undefined>;
    signalColorHeader: Signal<string | undefined>;
    signalColorHeaderText: Signal<string | undefined>;
    signalColorBackground: Signal<string | undefined>;
    signalCloseConfirmationEnabled: Signal<boolean>;
    signalVerticalSwipeEnabled: Signal<boolean>;
}

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export const tgEventHandler = (event: TelegramMethodEvent, webview: any, platform: TelegramPlatform, signals: TGEventHandlerSignals) => {
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    let eventData: any = event.eventData;

    try {
        eventData = JSON.parse(eventData);
    } catch (e) {}

    const [mode] = signals.signalMode;
	const [expanded, setExpanded] = signals.signalExpanded;
    const [, setColorHeader] = signals.signalColorHeader;
    const [, setColorHeaderText] = signals.signalColorHeaderText;
    const [, setColorBackground] = signals.signalColorBackground;
    const [, setShake] = signals.signalShake;
    const [, setPopup] = signals.signalPopup;
    const [, setPopupQR] = signals.signalPopupQR;
    const [, setBackButtonEnabled] = signals.signalBackButtonEnabled;
    const [, setOpen] = signals.signalOpen;
    const [, setCloseConfirmationEnabled] = signals.signalCloseConfirmationEnabled;
    const [, setVerticalSwipeEnabled] = signals.signalVerticalSwipeEnabled;

    switch (event.eventType) {
        case "iframe_ready":
            break;

        case "iframe_will_reload":
            break;

        case "web_app_ready":
            break;

        case "web_app_close":
            if (webview?.isDevToolsOpened) {
                webview?.closeDevTools();
            }
            webview = undefined;
            setOpen(false);
            break;

        case "web_app_expand":
            setExpanded(true);
            break;

        case "web_app_set_header_color": {
            let color = eventData.color;

            if (!isHexColor(eventData.color) && "color_key" in eventData) {
                switch (eventData.color_key) {
                    case "bg_color":
                        color = TelegramThemes[platform][mode()].bg_color;
                        break;
                    case "secondary_bg_color":
                        color =
                            TelegramThemes[platform][mode()].secondary_bg_color;
                        break;
                }
            }

            if (color) {
                batch(() => {
                    setColorHeader(color);
                    setColorHeaderText(isColorDark(color) ? "#ffffff" : "#000000");
                });
            }
            break;
        }

        case "web_app_set_background_color": {
            let color = eventData.color;

            if (!isHexColor(eventData.color) && "color_key" in eventData) {
                switch (eventData.color_key) {
                    case "bg_color":
                        color = TelegramThemes[platform][mode()].bg_color;
                        break;
                    case "secondary_bg_color":
                        color =
                            TelegramThemes[platform][mode()].secondary_bg_color;
                        break;
                }
            }

            if (color) {
                setColorBackground(color);
            }
            break;
        }

        case "web_app_set_bottom_bar_color": {
            let color = eventData.color;

            if (!isHexColor(eventData.color) && "color_key" in eventData) {
                switch (eventData.color_key) {
                    case "bg_color":
                        color = TelegramThemes[platform][mode()].bg_color;
                        break;
                    case "secondary_bg_color":
                        color =
                            TelegramThemes[platform][mode()].secondary_bg_color;
                        break;
                    case "bottom_bar_bg_color":
                        color =
                            TelegramThemes[platform][mode()].bottom_bar_bg_color;
                        break;
                }
            }

            if (color) {
                // TODO: implement bottom bar bg color
            }
            break;
        }

        case "web_app_trigger_haptic_feedback": {
            setShake(true);
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

            setTimeout(() => setShake(false), shakeTimeout);
            break;
        }

        case "web_app_request_theme":
            tgEmitEvent('theme_changed', {
                theme_params: TelegramThemes[platform][mode()],
            }, webview, platform);
            break;

        case "web_app_request_viewport": {
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
                platform,
            );
            break;
        }

        case "web_app_setup_swipe_behavior":
            setVerticalSwipeEnabled(eventData.allow_vertical_swipe);
            break;

        case "web_app_setup_closing_behavior":
            setCloseConfirmationEnabled(eventData.need_confirmation);
            break;

        case "web_app_setup_back_button":
            setBackButtonEnabled(eventData.is_visible);
            break;

        case "web_app_setup_main_button":
            break;

        case "web_app_setup_secondary_button":
            break;

        case "web_app_setup_settings_button":
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
            setPopupQR(eventData);
            break;

        case "web_app_close_scan_qr_popup":
            setPopupQR(undefined);
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
            setPopup(eventData);
            break;

        case "web_app_read_text_from_clipboard":
            setPopup({
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
            setPopup({
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
            setPopup({
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
            break;
    }
}
