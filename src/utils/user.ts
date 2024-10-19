import type { User } from "../types";
import { createSignal } from "solid-js";
import { useSettings } from "../contexts/SettingsContext";

export const [users, setUsers] = createSignal<User[]>([]);
export const [activeUserId, setActiveUserId] = createSignal('none');

export const loadUsers = async () => {
    const { settings } = useSettings();
    const usersList = (await settings?.get("users")) as User[] | undefined;
    if (!usersList) {
        await settings?.set("users", []);
        await settings?.save();
    } else {
        setUsers(usersList);
    }
    setActiveUserId(await settings?.get("active_user") ?? 'none');
    return true;
};