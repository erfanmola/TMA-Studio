import type { JSX } from "solid-js";

export type Project = {
    id: string,
    name: string,
    url: string,
    token?: string,
};

export type TabbarTab = {
    id: string,
    title: string,
    dynamic?: boolean,
    component: Element | JSX.Element | (() => Element) | (() => JSX.Element),
    closable: boolean,
};

export type User = {
    id: string,
    first_name: string,
    last_name?: string,
    username?: string,
    photo_url?: string,
    language_code?: string,
    is_premium?: true,
    allows_write_to_pm?: true,
};