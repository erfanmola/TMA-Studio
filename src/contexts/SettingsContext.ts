import { createContext, useContext } from 'solid-js';

import type { Store } from '@tauri-apps/plugin-store';

type SettingsContextType = {
    settings: Store | undefined,
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider = SettingsContext.Provider;

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error("useSettings must be used within a SettingsProvider");
    }
    return context;
};