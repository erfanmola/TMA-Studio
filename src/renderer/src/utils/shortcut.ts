export type OSCombiatorKey = "ctrl" | "command";

export const getOSCombinatorKey = (): OSCombiatorKey => {
	return window.electron.process.platform === "darwin" ? "command" : "ctrl";
};

export const getOSKeyComboExpression = (combo: string) => {
	return `${getOSCombinatorKey()}+${combo.replace(" ", "")}`;
};
