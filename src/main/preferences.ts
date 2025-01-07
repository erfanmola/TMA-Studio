import type { Project, TabbarTab, User } from "../renderer/src/types";

export type Preferences = {
    theme_mode: 'light' | 'dark';
    ui: {
        scale: number,
        sidebar: {
            visible: boolean,
        }
    },
    project: {
        floating_window_on_top: boolean,
        floating_window_size: number,
        shake_on_haptic: boolean,
        macos_vibrate_on_haptic: boolean,
    },
    intro: {
        skip: boolean,
    },
    tabbar: {
        tabs: TabbarTab[],
        active: TabbarTab['id'],
    },
    projects: Project[],
    users: {
        users: User[],
        active: string | number,
    },
};

export const defaultPreferences: Preferences = {
    theme_mode: 'light',
    ui: {
        scale: 0.9,
        sidebar: {
            visible: true,
        },
    },
    project: {
        floating_window_on_top: true,
        floating_window_size: 420,
        shake_on_haptic: true,
        macos_vibrate_on_haptic: true,
    },
    intro: {
        skip: false,
    },
    tabbar: {
        active: 'projects',
        tabs: [],
    },
    projects: [],
    users: {
        active: 'none',
        users: [],
    }
};
