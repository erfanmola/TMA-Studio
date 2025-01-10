import { createStore } from "solid-js/store";
import { defaultPreferences, type Preferences } from "../../../main/preferences";

export const [preferences, setPreferences] = createStore<Preferences>({ ...defaultPreferences });

export const [modals, setModals] = createStore<{
    project: {
        new: {
            open: boolean,
        },
    },
    user: {
        new: {
            open: boolean,
        },
    },
}>({
    project: {
        new: {
            open: false,
        },
    },
    user: {
        new: {
            open: false,
        },
    },
});