import webviewStyle from "../scss/_webview.scss?inline";

import {
	batch,
	createEffect,
	createResource,
	on,
	onCleanup,
	Show,
	type Component,
} from "solid-js";
import type { SetStoreFunction } from "solid-js/store";
import type { TMAProjectFrame } from "@renderer/pages/Project";
import {
	generateProjectFrame,
	generateProjectInner,
	tgEmitEvent,
	tgEventHandler,
	tgWebAppData,
	type TMAProjectInner,
} from "@renderer/utils/telegram";
import { PopupHandler } from "./PopupHandler";
import { PopupQRHandler } from "./PopupQRHandler";
import { PopupStoryHandler } from "./PopupStory";
import { type TelegramPlatform, TelegramThemes } from "@renderer/utils/themes";

import type {
	Project,
	TelegramMethodEvent,
	TelegramPopup,
} from "@renderer/types";
import type { WebviewTag } from "electron";
import type { MenuMoreStore } from "./MenuMore";
import { preferences } from "@renderer/utils/preferences";

declare module "solid-js" {
	namespace JSX {
		interface IntrinsicElements {
			webview: WebviewTag;
		}
	}
}

export const TMAView: Component<{
	project: Project;
	projectFrameStore: [TMAProjectFrame, SetStoreFunction<TMAProjectFrame>];
	projectInnerStore: [TMAProjectInner, SetStoreFunction<TMAProjectInner>];
	menuMoreStore: [MenuMoreStore, SetStoreFunction<MenuMoreStore>];
}> = (props) => {
	const [projectFrame, setProjectFrame] = props.projectFrameStore;
	const [projectInner, setProjectInner] = props.projectInnerStore;

	const [menuMore, setMenuMore] = props.menuMoreStore;

	const [webAppUrl] = createResource(async () => {
		return `${props.project.url}${await tgWebAppData(
			projectFrame.platform,
			projectFrame.state.mode,
			preferences.users.users.find(
				(item) => item.id === preferences.users.active,
			),
			props.project.token,
		)}`;
	});

	// Notify the webview about theme change
	createEffect(
		on(
			() => projectFrame.state.mode,
			() => {
				if (!projectFrame.state.open) return;

				tgEmitEvent(
					"theme_changed",
					{
						theme_params:
							TelegramThemes[projectFrame.platform][projectFrame.state.mode],
					},
					projectInner.webview,
					projectFrame.platform,
				);
			},
			{ defer: true },
		),
	);

	// Notify the webview about viewport change
	createEffect(
		on(
			() => projectFrame.state.expanded,
			() => {
				if (!projectFrame.state.open || !projectInner.webview) return;

				const { width, height } = projectInner.webview.getBoundingClientRect();

				tgEmitEvent(
					"viewport_changed",
					{
						height: Math.round(height),
						width: Math.round(width),
						is_expanded: projectFrame.state.expanded,
						is_state_stable: true,
					},
					projectInner.webview,
					projectFrame.platform,
				);
			},
			{ defer: true },
		),
	);

	// Sync inspect element indicator and actual open/close state
	createEffect(
		on(
			() => projectFrame.inspectElement.open,
			() => {
				if (!projectFrame.state.open) return;

				if (
					projectFrame.inspectElement.open &&
					!projectInner.webview?.isDevToolsOpened()
				) {
					projectInner.webview?.openDevTools();
				} else if (
					projectInner.webview?.isDevToolsOpened() &&
					!projectFrame.inspectElement.open
				) {
					projectInner.webview.closeDevTools();
				}
			},
			{ defer: true },
		),
	);

	// Reset the buttonId of previous popups, if any
	createEffect(
		on(
			() => projectInner.popup.regular.popup,
			() => {
				if (!projectFrame.state.open) return;

				if (projectInner.popup.regular.popup) {
					setProjectInner("popup", "regular", "press_id", undefined);
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
			() => projectInner.popup.regular.press_id,
			() => {
				if (!projectFrame.state.open) return;

				if (typeof projectInner.popup.regular.press_id === "string") {
					if (
						projectInner.popup.regular.press_id === "tg_webapp_close_confirm"
					) {
						CloseWebview();
					} else if (
						projectInner.popup.regular.press_id?.startsWith(
							"tg_webapp_clipboard_confirm_",
						)
					) {
						tgEmitEvent(
							"clipboard_text_received",
							{
								req_id: projectInner.popup.regular.press_id?.replace(
									"tg_webapp_clipboard_confirm_",
									"",
								),
								data: window.clipboard.getText(),
							},
							projectInner.webview,
							projectFrame.platform,
						);
					} else if (
						projectInner.popup.regular.press_id?.startsWith(
							"tg_webapp_clipboard_cancel_",
						)
					) {
						tgEmitEvent(
							"clipboard_text_received",
							{
								req_id: projectInner.popup.regular.press_id?.replace(
									"tg_webapp_clipboard_cancel_",
									"",
								),
							},
							projectInner.webview,
							projectFrame.platform,
						);
					} else if (
						projectInner.popup.regular.press_id ===
						"tg_webapp_write_access_confirm"
					) {
						tgEmitEvent(
							"write_access_requested",
							{
								status: "allowed",
							},
							projectInner.webview,
							projectFrame.platform,
						);
					} else if (
						projectInner.popup.regular.press_id ===
						"tg_webapp_write_access_cancel"
					) {
						tgEmitEvent(
							"write_access_requested",
							{
								status: "cancelled",
							},
							projectInner.webview,
							projectFrame.platform,
						);
					} else if (
						projectInner.popup.regular.press_id === "tg_webapp_contact_confirm"
					) {
						tgEmitEvent(
							"phone_requested",
							{
								status: "sent",
							},
							projectInner.webview,
							projectFrame.platform,
						);
					} else if (
						projectInner.popup.regular.press_id === "tg_webapp_contact_cancel"
					) {
						tgEmitEvent(
							"phone_requested",
							{
								status: "cancelled",
							},
							projectInner.webview,
							projectFrame.platform,
						);
					} else {
						tgEmitEvent(
							"popup_closed",
							{
								button_id: projectInner.popup.regular.press_id,
							},
							projectInner.webview,
							projectFrame.platform,
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
			() => projectInner.popup.qr.popup,
			() => {
				if (!projectFrame.state.open) return;

				if (projectInner.popup.qr.popup) {
					setProjectInner("popup", "qr", "data", undefined);
				} else {
					tgEmitEvent(
						"scan_qr_popup_closed",
						{},
						projectInner.webview,
						projectFrame.platform,
					);
				}
			},
			{
				defer: true,
			},
		),
	);

	// Notify the webview about QR Scan popup data receive
	createEffect(
		on(
			() => projectInner.popup.qr.data,
			() => {
				if (!projectFrame.state.open) return;

				if (typeof projectInner.popup.qr.data === "string") {
					tgEmitEvent(
						"qr_text_received",
						{
							data: projectInner.popup.qr.data,
						},
						projectInner.webview,
						projectFrame.platform,
					);
				}
			},
			{
				defer: true,
			},
		),
	);

	// Detect the close button click
	createEffect(
		on(
			() => menuMore.closeOrBack.clicked,
			() => {
				if (menuMore.closeOrBack.clicked) {
					setMenuMore("closeOrBack", "clicked", false);
					onClickBackOrCloseButton();
				}
			},
		),
	);

	// Detect the reload button click from child menu component
	createEffect(
		on(
			() => menuMore.reload.clicked,
			() => {
				if (menuMore.reload.clicked) {
					setMenuMore("reload", "clicked", false);
					if (projectInner.webview!) {
						projectInner.webview.reload();
					}
				}
			},
		),
	);

	// Detect the settings button click from child menu component
	createEffect(
		on(
			() => menuMore.settings.clicked,
			() => {
				if (menuMore.settings.clicked) {
					setMenuMore("settings", "clicked", false);
					tgEmitEvent(
						"settings_button_pressed",
						{},
						projectInner.webview!,
						projectFrame.platform,
					);
				}
			},
		),
	);

	createEffect(
		on(
			() => projectFrame.state.open,
			() => {
				if (!projectFrame.state.open) {
					batch(() => {
						setProjectFrame("inspectElement", "open", false);
						setProjectFrame("state", "expanded", false);

						setProjectInner("backButton", "enabled", false);
						setProjectInner("settingsButton", "enabled", false);
						setProjectInner("closeConfirmation", "enabled", false);
					});
				}
			},
			{
				defer: true,
			},
		),
	);

	createEffect(() => {
		if (projectFrame.state.open) {
			initializeWebview();
		}
	});

	const initializeWebview = async () => {
		if (!projectInner.webview) return;

		projectInner.webview.addEventListener("ipc-message", (e) => {
			if (import.meta.env.DEV) {
				console.log("Received message from webview:", e.channel, e.args);
			}

			if (e.channel === "method") {
				tgEventHandler(
					e.args[0] as TelegramMethodEvent,
					projectInner.webview,
					projectFrame.platform,
					[projectFrame, setProjectFrame],
					[projectInner, setProjectInner],
				);
			}
		});

		projectInner.webview.addEventListener("did-attach", () => {
			projectInner.webview?.addEventListener("devtools-opened", () => {
				setProjectFrame("inspectElement", "open", true);
			});

			projectInner.webview?.addEventListener("devtools-closed", () => {
				setProjectFrame("inspectElement", "open", false);
			});
		});

		projectInner.webview.addEventListener("dom-ready", () => {
			projectInner.webview?.insertCSS(webviewStyle);
			setProjectInner("ready", true);
		});

		onCleanup(() => {
			if (projectFrame.state.open && projectInner.webview?.isDevToolsOpened()) {
				try {
					projectInner.webview.closeDevTools();
				} catch (e) {}
			}
		});
	};

	const onClickBackOrCloseButton = () => {
		if (!projectInner.webview) return;

		if (projectInner.backButton.enabled) {
			tgEmitEvent(
				"back_button_pressed",
				{},
				projectInner.webview,
				projectFrame.platform,
			);
		} else {
			if (projectInner.closeConfirmation.enabled) {
				setProjectInner("popup", "regular", "popup", {
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
		if (projectInner.webview?.isDevToolsOpened()) {
			projectInner.webview?.closeDevTools();
		}
		projectInner.webview?.remove();
		batch(() => {
			setProjectFrame(
				generateProjectFrame(projectFrame.platform, props.project),
			);
			setProjectInner(generateProjectInner(projectFrame));
			setProjectFrame("state", "open", false);
		});
	};

	return (
		<>
			<Show when={!projectInner.ready}>
				<div
					style={{
						"background-color":
							projectInner.theme.color.background ??
							TelegramThemes[projectFrame.platform][projectFrame.state.mode]
								.bg_color,
					}}
				/>
			</Show>
			<webview
				// @ts-ignore
				ref={(el) => setProjectInner("webview", el)}
				id={`webview-${props.project.id}-${projectFrame.platform}`}
				src={webAppUrl() ?? ""}
			/>
		</>
	);
};

export const TMAViewOverlay: Component<{
	projectFrameStore: [TMAProjectFrame, SetStoreFunction<TMAProjectFrame>];
	projectInnerStore: [TMAProjectInner, SetStoreFunction<TMAProjectInner>];
}> = (props) => {
	const [projectFrame, setProjectFrame] = props.projectFrameStore;
	const [projectInner, setProjectInner] = props.projectInnerStore;

	return (
		<>
			<Show when={projectInner.popup.regular.popup}>
				<PopupHandler
					projectFrameStore={[projectFrame, setProjectFrame]}
					projectInnerStore={[projectInner, setProjectInner]}
				/>
			</Show>

			<Show when={projectInner.popup.qr.popup}>
				<PopupQRHandler
					projectFrameStore={[projectFrame, setProjectFrame]}
					projectInnerStore={[projectInner, setProjectInner]}
				/>
			</Show>

			<Show when={projectInner.popup.story.popup}>
				<PopupStoryHandler
					projectFrameStore={[projectFrame, setProjectFrame]}
					projectInnerStore={[projectInner, setProjectInner]}
				/>
			</Show>
		</>
	);
};

export const getProjectWebview = (
	projectId: Project["id"],
	platform: TelegramPlatform,
): WebviewTag | null => {
	return document.querySelector(`#webview-${projectId}-${platform}`);
};
