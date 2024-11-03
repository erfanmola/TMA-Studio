import type { User } from "../types";
import { createSignal } from "solid-js";

export const [users, setUsers] = createSignal<User[]>([]);
export const [activeUserId, setActiveUserId] = createSignal<string | number>('none');