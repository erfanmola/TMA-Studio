import { setPreferences } from "./preferences";
import { useSettings } from "../contexts/SettingsContext";

export const initStore = () => {
    const { settings } = useSettings();

    const preferencesSaved = settings.get("preferences");
    if (preferencesSaved) {
        for (const key in preferencesSaved) {
            // @ts-ignore
            setPreferences(key, preferencesSaved[key]);
        }
    }

    return true;
};