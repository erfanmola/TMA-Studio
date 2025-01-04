import "../scss/sections/_popup-qr.scss";

import type { TMAProjectFrame } from "@renderer/pages/Project";
import type { TMAProjectInner } from "@renderer/utils/telegram";
import { CgClose } from "solid-icons/cg";
import { type Component, createSignal, Show } from "solid-js";
import type { SetStoreFunction } from "solid-js/store";

export const PopupQRHandler: Component<{
	projectFrameStore: [TMAProjectFrame, SetStoreFunction<TMAProjectFrame>];
	projectInnerStore: [TMAProjectInner, SetStoreFunction<TMAProjectInner>];
}> = (props) => {
	const [projectFrame] = props.projectFrameStore;
	const [projectInner, setProjectInner] = props.projectInnerStore;

	const [text, setText] = createSignal("");

	return (
		<Show when={projectInner.popup.qr.popup}>
			<div
				class={`popup-qr-overlay ${projectFrame.platform} ${projectFrame.state.mode}`}
			>
				<div />

				<CgClose
					onClick={() => setProjectInner("popup", "qr", "popup", undefined)}
				/>

				<section>
					<textarea
						value={text()}
						onInput={(e) => setText(e.target.value)}
						placeholder="Enter QR String Data"
					/>
					<button
						type="button"
						disabled={text().length < 1}
						onClick={() => setProjectInner("popup", "qr", "data", text())}
					>
						Send Data
					</button>
					<span>{projectInner.popup.qr.popup?.text ?? "Scan QR Code"}</span>
				</section>
			</div>
		</Show>
	);
};
