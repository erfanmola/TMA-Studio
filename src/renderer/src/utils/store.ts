import { useSettings } from "../contexts/SettingsContext";
import { setPreferences } from "./preferences";

export const initStore = () => {
	const { settings } = useSettings();

	const preferencesSaved = settings.get("preferences");
	if (preferencesSaved) {
		for (const key in preferencesSaved) {
			// @ts-expect-error
			setPreferences(key, preferencesSaved[key]);
		}
	}

	return true;
};
