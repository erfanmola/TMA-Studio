import type { Project, TabbarTab } from "../types";
import { preferences, setPreferences } from "./preferences";

import type { TelegramPlatform } from "./themes";

export const defaultProjectPlatforms: TelegramPlatform[] = [
	"ios",
	"android",
	"tdesktop",
];

export const openProject = (
	projectId: Project["id"],
	component: TabbarTab["component"],
) => {
	const project = preferences.projects.find((item) => item.id === projectId);
	if (!project) return;

	if (
		!preferences.tabbar.tabs.find((item) => item.id === `project-${projectId}`)
	) {
		setPreferences("tabbar", "tabs", [
			...preferences.tabbar.tabs,
			{
				id: `project-${projectId}`,
				title: project.name,
				dynamic: false,
				component: component,
				closable: true,
			},
		]);
	}

	setPreferences("tabbar", "active", `project-${projectId}`);
};
