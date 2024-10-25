import type { Project, User } from "../types";
import { setActiveUserId, setUsers } from "./user";

import { setProjects } from "./project";
import { useSettings } from "../contexts/SettingsContext";

export const initStore = () => {
    const { settings } = useSettings();

    const projectsList = (settings.get("projects")) as Project[] | undefined;
    if (!projectsList) {
        settings.set("projects", []);
    } else {
        setProjects(projectsList);
    }

    const usersList = (settings.get("users")) as User[] | undefined;
    if (!usersList) {
        settings.set("users", []);
    } else {
        setUsers(usersList);
    }
    setActiveUserId(settings.get("active_user") ?? 'none');

    return true;
};