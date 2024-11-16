import type { TelegramPlatform, ThemeMode } from "./utils/themes";

import type { JSX } from "solid-js";

export type Project = {
    id: string,
    name: string,
    url: string,
    token?: string,
    settings: {
        [key in TelegramPlatform]: {
            open: boolean,
            expanded: boolean,
            mode: ThemeMode,
        }
    },
};

export type TabbarTab = {
    id: string,
    title: string,
    dynamic?: boolean,
    component: Element | JSX.Element | (() => Element) | (() => JSX.Element),
    closable: boolean,
};

export type User = {
    id: number,
    first_name: string,
    last_name?: string,
    username?: string,
    photo_url?: string,
    language_code?: string,
    is_premium?: true,
    allows_write_to_pm?: true,
};

export type TelegramMethodEvent = {
	eventData: string;
	eventType: string;
};

export type TelegramPopupButton = {
    id?: string,
    type?: 'default' | 'ok' | 'close' | 'cancel' | 'destructive',
    text?: string,
};

export type TelegramPopup = {
    title?: string,
    message: string,
    buttons?: TelegramPopupButton[]
};

export type TelegramScanQRPopup = {
    text?: string,
};

export type TelegramStory = {
    media_url: string,
    text?: string,
    widget_link?: {
        url: string,
        name?: string,
    },
};