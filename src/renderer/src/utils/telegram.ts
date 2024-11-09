import { TelegramThemes, type TelegramPlatform, type ThemeMode } from "./themes";
import hmac from 'js-crypto-hmac';

import type { TelegramMethodEvent, TelegramPopup, User } from "@renderer/types";
import { buffer2Hex, deserializeObject, ksort } from "./general";
import { batch, type Signal } from "solid-js";
import { isHexColor, isColorDark } from "./color";

export const TGWebAppVersion = '7.10';

export const tgWebAppData = async (platform: TelegramPlatform, mode: ThemeMode, user: User | undefined, token: string | undefined): Promise<string> => {
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
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
    .join('\n');

    return buffer2Hex(await hmac.compute(await hmac.compute(new TextEncoder().encode('WebAppData'), new TextEncoder().encode(token), 'SHA-256'), new TextEncoder().encode(initDataString), 'SHA-256'));
}

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export const tgEmitEvent = async (eventType: string, eventData: any, webview: any, platform: TelegramPlatform) => {
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

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export const tgEventHandler = (event: TelegramMethodEvent, webview: any, platform: TelegramPlatform, signalMode: Signal<ThemeMode>, signalExpanded: Signal<boolean>, signalShake: Signal<boolean>, signalPopup: Signal<TelegramPopup | undefined>, signalColorHeader: Signal<string | undefined>, signalColorHeaderText: Signal<string | undefined>, signalColorBackground: Signal<string | undefined>) => {
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    let eventData: any = event.eventData;

    try {
        eventData = JSON.parse(eventData);
    } catch (e) {}

    const [mode] = signalMode;
	const [expanded, setExpanded] = signalExpanded;
    const [, setColorHeader] = signalColorHeader;
    const [, setColorHeaderText] = signalColorHeaderText;
    const [, setColorBackground] = signalColorBackground;
    const [, setShake] = signalShake;
    const [, setPopup] = signalPopup;

    switch (event.eventType) {
        case "iframe_ready":
            break;

        case "web_app_ready":
            break;

        case "web_app_close":
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
            break;

        case "web_app_setup_closing_behavior":
            break;

        case "web_app_setup_back_button":
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
            break;

        case "web_app_close_scan_qr_popup":
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
            break;

        case "web_app_request_write_access":
            break;

        case "web_app_request_phone":
            break;

        case "web_app_share_to_story":
            break;
    }
}
