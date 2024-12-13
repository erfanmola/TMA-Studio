import { createStore } from "solid-js/store";

type Preferences = {
    theme_mode: 'light' | 'dark';
    project: {
        floating_window_on_top: boolean,
    }
};

export const [preferences, setPreferences] = createStore<Preferences>({
    theme_mode: 'light',
    project: {
        floating_window_on_top: true,
    }
});