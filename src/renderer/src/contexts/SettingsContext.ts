import { createContext, useContext } from 'solid-js';

type SettingsContextType = {
    settings: {
        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
        get: (key: string) => any,
        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
        set: (key: string, value: any) => void,
    },
};

const SettingsContext = createContext<SettingsContextType>(undefined);

export const SettingsProvider = SettingsContext.Provider;

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error("useSettings must be used within a SettingsProvider");
    }
    return context;
};