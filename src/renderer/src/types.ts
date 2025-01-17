import type { BrowserWindow, Tray } from "electron";
import type { TelegramPlatform, ThemeMode } from "./utils/themes";

import type { JSX } from "solid-js";

export type Project = {
	id: string;
	name: string;
	url: string;
	token?: string;
	settings: {
		[key in TelegramPlatform]: {
			open: boolean;
			expanded: boolean;
			mode: ThemeMode;
			floating: boolean;
		};
	};
	platforms?: TelegramPlatform[];
};

export type TabbarTab = {
	id: string;
	title: string;
	dynamic?: boolean;
	component: Element | JSX.Element | (() => Element) | (() => JSX.Element);
	closable: boolean;
};

export type User = {
	id: number;
	first_name: string;
	last_name?: string;
	username?: string;
	photo_url?: string;
	language_code?: string;
	is_premium?: true;
	allows_write_to_pm?: true;
};

export type TelegramMethodEvent = {
	eventData: string;
	eventType: string;
};

export type TelegramPopupButton = {
	id?: string;
	type?: "default" | "ok" | "close" | "cancel" | "destructive";
	text?: string;
};

export type TelegramPopup = {
	title?: string;
	message: string;
	buttons?: TelegramPopupButton[];
};

export type TelegramScanQRPopup = {
	text?: string;
};

export type TelegramStory = {
	media_url: string;
	text?: string;
	widget_link?: {
		url: string;
		name?: string;
	};
};

export type TelegramButtonMain = {
	text: string;
	color: string;
	text_color: string;
	is_active: boolean;
	has_shine_effect: boolean;
	is_progress_visible: boolean;
	is_visible: boolean;
	position?: "left" | "right" | "top" | "bottom";
};

export type TelegramButtonSecondary = TelegramButtonMain;

export type IPCMainPreferences = {
	theme: {
		mode: ThemeMode;
		window_widgets: {
			[key in ThemeMode]: {
				bg: string;
				color: string;
			};
		};
	};
	zoom: {
		level: number;
	};
	windows: {
		popups: { [key: string]: BrowserWindow[] };
		main: BrowserWindow | undefined;
		welcome: BrowserWindow | undefined;
	};
	tray: Tray | undefined;
};
