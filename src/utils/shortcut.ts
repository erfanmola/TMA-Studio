import { platform } from "@tauri-apps/plugin-os";

export type OSCombiatorKey = 'ctrl' | 'command';

export const getOSCombinatorKey = (): OSCombiatorKey => {
    return platform() === 'macos' ? 'command' : 'ctrl';
};

export const getOSKeyComboExpression = (combo: string) => {
    return `${getOSCombinatorKey()}+${combo.replace(' ', '')}`;
};