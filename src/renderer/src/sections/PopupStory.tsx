import "../scss/sections/_popup-story.scss";

import type { TelegramStory } from "@renderer/types";
import type { TelegramPlatform, ThemeMode } from "@renderer/utils/themes";
import { CgClose } from "solid-icons/cg";
import {
	type Component,
	type Signal,
	createResource,
	Match,
	Show,
	Suspense,
	Switch,
} from "solid-js";

const getMediaTypeFromURL = async (
	url: string,
): Promise<"image" | "video" | "unknown" | "error"> => {
	try {
		// Fetch the URL headers only (no need to download the full content)
		const response = await fetch(url, { method: "HEAD" });

		if (!response.ok) {
			throw new Error("Failed to fetch the URL headers");
		}

		// Get the Content-Type header
		const contentType = response.headers.get("Content-Type");

		if (contentType) {
			if (contentType.startsWith("image/")) {
				return "image";
			}
			if (contentType.startsWith("video/")) {
				return "video";
			}
			return "unknown";
		}
		return "unknown";
	} catch (error) {
		console.error("Error:", error);
		return "error";
	}
};

export const PopupStoryHandler: Component<{
	platform: TelegramPlatform;
	mode: ThemeMode;
	signalPopupStory: Signal<TelegramStory | undefined>;
}> = (props) => {
	const [popupStory, setPopupStory] = props.signalPopupStory;
	const [mediaType] = createResource(async () => {
		return await getMediaTypeFromURL(popupStory()?.media_url ?? "");
	});

	return (
		<Show when={popupStory()}>
			<div class={`popup-story-overlay ${props.platform} ${props.mode}`}>
				<div />

				<CgClose onClick={() => setPopupStory(undefined)} />

				<section>
					<div>
						<Suspense fallback={<span>Loading...</span>}>
							<Switch>
								<Match when={mediaType() === "image"}>
									<img alt="story" src={popupStory()?.media_url ?? ""} />
								</Match>

								<Match when={mediaType() === "video"}>
									{/* biome-ignore lint/a11y/useMediaCaption: <explanation> */}
									<video src={popupStory()?.media_url ?? ""} autoplay loop />
								</Match>

								<Match when={mediaType() === "unknown"}>
									<span>Unknown File Type</span>
								</Match>

								<Match when={mediaType() === "error"}>
									<span>Error</span>
								</Match>
							</Switch>
						</Suspense>
					</div>

					<Show when={popupStory()?.text}>
						<span>{popupStory()?.text}</span>
					</Show>

					<Show when={popupStory()?.widget_link}>
						<a href={popupStory()?.widget_link?.url}>
							{popupStory()?.widget_link?.name ?? "LINK"}
						</a>
					</Show>
				</section>
			</div>
		</Show>
	);
};
