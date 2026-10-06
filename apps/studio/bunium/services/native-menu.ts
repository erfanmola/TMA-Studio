import ar from "../../src/locales/ar.json";
import de from "../../src/locales/de.json";
import en from "../../src/locales/en.json";
import fa from "../../src/locales/fa.json";
import ru from "../../src/locales/ru.json";

export const STUDIO_MENU_ACTION = {
  home: 1,
  createProject: 2,
  users: 3,
  settings: 4,
  quit: 5,
} as const;

export type StudioMenuLabels = (typeof en)["nativeMenu"];
export type StudioMenuItem =
  | { type: "separator" }
  | {
      label: string;
      id?: number;
      submenu?: StudioMenuItem[];
    };

const dictionaries = { ar, de, en, fa, ru };

export function nativeMenuLabels(locale: string | undefined): StudioMenuLabels {
  if (locale && Object.hasOwn(dictionaries, locale)) {
    return dictionaries[locale as keyof typeof dictionaries].nativeMenu;
  }
  return en.nativeMenu;
}

export function studioNativeMenuItems(
  labels: StudioMenuLabels,
): StudioMenuItem[] {
  return [
    {
      label: labels.appTitle,
      submenu: [
        { label: labels.home, id: STUDIO_MENU_ACTION.home },
        { label: labels.createProject, id: STUDIO_MENU_ACTION.createProject },
        { label: labels.manageUsers, id: STUDIO_MENU_ACTION.users },
        { label: labels.settings, id: STUDIO_MENU_ACTION.settings },
        { type: "separator" },
        { label: labels.quit, id: STUDIO_MENU_ACTION.quit },
      ],
    },
  ];
}

export function dispatchStudioMenuAction(
  id: number,
  actions: Record<keyof typeof STUDIO_MENU_ACTION, () => void>,
): boolean {
  const action = Object.entries(STUDIO_MENU_ACTION).find(
    ([, actionId]) => actionId === id,
  )?.[0] as keyof typeof STUDIO_MENU_ACTION | undefined;
  if (!action) return false;
  actions[action]();
  return true;
}
