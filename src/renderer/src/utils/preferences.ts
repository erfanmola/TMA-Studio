import { createStore } from "solid-js/store";

type Preferences = {
    theme_mode: 'light' | 'dark';
    ui: {
        scale: number,
    },
    project: {
        floating_window_on_top: boolean,
        floating_window_size: number,
        shake_on_haptic: boolean,
        macos_vibrate_on_haptic: boolean,
    }
};

export const [preferences, setPreferences] = createStore<Preferences>({
    theme_mode: 'light',
    ui: {
        scale: 0.9,
    },
    project: {
        floating_window_on_top: true,
        floating_window_size: 420,
        shake_on_haptic: true,
        macos_vibrate_on_haptic: true,
    }
});