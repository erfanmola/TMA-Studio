import "../scss/sections/_popup-story.scss";

import type { TMAProjectFrame } from "@renderer/pages/Project";
import type { TMAProjectInner } from "@renderer/utils/telegram";
import { CgClose } from "solid-icons/cg";
import {
	type Component,
	createResource,
	Match,
	Show,
	Suspense,
	Switch,
} from "solid-js";
import type { SetStoreFunction } from "solid-js/store";

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
	projectFrameStore: [TMAProjectFrame, SetStoreFunction<TMAProjectFrame>];
	projectInnerStore: [TMAProjectInner, SetStoreFunction<TMAProjectInner>];
}> = (props) => {
	const [projectFrame] = props.projectFrameStore;
	const [projectInner, setProjectInner] = props.projectInnerStore;

	const [mediaType] = createResource(async () => {
		return await getMediaTypeFromURL(
			projectInner.popup.story.popup?.media_url ?? "",
		);
	});

	return (
		<Show when={projectInner.popup.story.popup}>
			<div
				class={`popup-story-overlay ${projectFrame.platform} ${projectFrame.state.mode}`}
			>
				<div />

				<CgClose
					onClick={() => setProjectInner("popup", "story", "popup", undefined)}
				/>

				<section>
					<div>
						<Suspense fallback={<span>Loading...</span>}>
							<Switch>
								<Match when={mediaType() === "image"}>
									<img
										alt="story"
										src={projectInner.popup.story.popup?.media_url ?? ""}
									/>
								</Match>

								<Match when={mediaType() === "video"}>
									<video
										src={projectInner.popup.story.popup?.media_url ?? ""}
										autoplay
										loop
									/>
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

					<Show when={projectInner.popup.story.popup?.text}>
						<span>{projectInner.popup.story.popup?.text}</span>
					</Show>

					<Show when={projectInner.popup.story.popup?.widget_link}>
						<a href={projectInner.popup.story.popup?.widget_link?.url}>
							{projectInner.popup.story.popup?.widget_link?.name ?? "LINK"}
						</a>
					</Show>
				</section>
			</div>
		</Show>
	);
};
