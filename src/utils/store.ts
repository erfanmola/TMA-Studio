import type { Project, User } from "../types";
import { setActiveUserId, setUsers } from "./user";

import { setProjects } from "./project";
import { useSettings } from "../contexts/SettingsContext";

export const initStore = async () => {
    const { settings } = useSettings();

    const projectsList = (await settings?.get("projects")) as Project[] | undefined;
    if (!projectsList) {
        await settings?.set("projects", []);
    } else {
        setProjects(projectsList);
    }

    const usersList = (await settings?.get("users")) as User[] | undefined;
    if (!usersList) {
        await settings?.set("users", []);
    } else {
        setUsers(usersList);
    }
    setActiveUserId(await settings?.get("active_user") ?? 'none');

    return true;
};