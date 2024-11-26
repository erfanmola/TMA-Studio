import { createStore } from "solid-js/store";

type Preferences = {
    theme_mode: 'light' | 'dark';
};

export const [preferences, setPreferences] = createStore<Preferences>({
    theme_mode: 'light',
});