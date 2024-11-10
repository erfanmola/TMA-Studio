import "../scss/sections/_popup-qr.scss";

import type { TelegramScanQRPopup } from "@renderer/types";
import type { TelegramPlatform, ThemeMode } from "@renderer/utils/themes";
import { CgClose } from "solid-icons/cg";
import { type Component, type Signal, createSignal, Show } from "solid-js";

export const PopupQRHandler: Component<{
	platform: TelegramPlatform;
	mode: ThemeMode;
	signalPopupQR: Signal<TelegramScanQRPopup | undefined>;
	signalPopupQRData: Signal<string | undefined>;
}> = (props) => {
	const [popupQR, setPopupQR] = props.signalPopupQR;
	const [, setPopupQRData] = props.signalPopupQRData;
	const [text, setText] = createSignal("");

	return (
		<Show when={popupQR()}>
			<div class={`popup-qr-overlay ${props.platform} ${props.mode}`}>
				<div />

				<CgClose onClick={() => setPopupQR(undefined)} />

				<section>
					<textarea
						value={text()}
						onInput={(e) => setText(e.target.value)}
						placeholder="Enter QR String Data"
					/>
					<button
						type="button"
						disabled={text().length < 1}
						onClick={() => setPopupQRData(text())}
					>
						Send Data
					</button>
					<span>{popupQR()?.text ?? "Scan QR Code"}</span>
				</section>
			</div>
		</Show>
	);
};
