import { createStore } from "solid-js/store";
import { defaultPreferences, type Preferences } from "../../../main/preferences";

export const [preferences, setPreferences] = createStore<Preferences>({ ...defaultPreferences });