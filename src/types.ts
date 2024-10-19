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