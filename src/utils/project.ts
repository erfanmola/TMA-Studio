import type { Project, TabbarTab } from "../types";
import { setActiveTabId, setTabbarData, tabbarData } from "../components/Tabbar";

import { createSignal } from "solid-js";

export const [projects, setProjects] = createSignal<Project[]>([]);

export const openProject = (projectId: Project["id"], component: TabbarTab['component']) => {
    const project = projects().find((item) => item.id === projectId);
    if (!project) return;

    if (!tabbarData().find((item) => item.id === `project-${projectId}`)) {
        setTabbarData([
            ...tabbarData(),
            {
                id: `project-${projectId}`,
                title: project.name,
                dynamic: false,
                component: component,
                closable: true,
            },
        ]);
    }

    setActiveTabId(`project-${projectId}`);
};