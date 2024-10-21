
export type TelegramPlatform = 'tdesktop' | 'ios' | 'android';

export type ThemeMode = 'dark' | 'light';

export type ThemeParams = {
    accentTextColor: string,
    bgColor: string,
    bottomBarBgColor: string,
    buttonColor: string,
    buttonTextColor: string,
    destructiveTextColor: string,
    headerBgColor: string,
    hintColor: string,
    linkColor: string,
    secondaryBgColor: string,
    sectionBgColor: string,
    sectionHeaderTextColor: string,
    sectionSeparatorColor: string,
    subtitleTextColor: string,
    textColor: string,
};

export const TelegramThemes: {
    [key in TelegramPlatform]: {
        [key in ThemeMode]: ThemeParams
    }
} = {
    android: {
        dark: {
            accentTextColor: "#64b5ef",
            bgColor: "#212d3b",
            bottomBarBgColor: "#151e27",
            buttonColor: "#50a8eb",
            buttonTextColor: "#ffffff",
            destructiveTextColor: "#ee686f",
            headerBgColor: "#242d39",
            hintColor: "#7d8b99",
            linkColor: "#5eabe1",
            secondaryBgColor: "#151e27",
            sectionBgColor: "#1d2733",
            sectionHeaderTextColor: "#79c4fc",
            sectionSeparatorColor: "#0d1218",
            subtitleTextColor: "#7b8790",
            textColor: "#ffffff"
        },
        light: {
            accentTextColor: "#1c93e3",
            bgColor: "#ffffff",
            bottomBarBgColor: "#f0f0f0",
            buttonColor: "#50a8eb",
            buttonTextColor: "#ffffff",
            destructiveTextColor: "#cc2929",
            headerBgColor: "#527da3",
            hintColor: "#a8a8a8",
            linkColor: "#2678b6",
            secondaryBgColor: "#f0f0f0",
            sectionBgColor: "#ffffff",
            sectionHeaderTextColor: "#3a95d5",
            sectionSeparatorColor: "#d9d9d9",
            subtitleTextColor: "#82868a",
            textColor: "#222222"
        }
    },
    ios: {
        dark: {
            accentTextColor: "#3e88f7",
            bgColor: "#000000",
            bottomBarBgColor: "#1d1d1d",
            buttonColor: "#3e88f7",
            buttonTextColor: "#ffffff",
            destructiveTextColor: "#eb5545",
            headerBgColor: "#1a1a1a",
            hintColor: "#98989e",
            linkColor: "#3e88f7",
            secondaryBgColor: "#000000",
            sectionBgColor: "#1c1c1d",
            sectionHeaderTextColor: "#8d8e93",
            sectionSeparatorColor: "#545458",
            subtitleTextColor: "#98989e",
            textColor: "#ffffff"
        },
        light: {
            accentTextColor: "#007aff",
            bgColor: "#ffffff",
            bottomBarBgColor: "#f2f2f2",
            buttonColor: "#007aff",
            buttonTextColor: "#ffffff",
            destructiveTextColor: "#ff3b30",
            headerBgColor: "#f8f8f8",
            hintColor: "#8e8e93",
            linkColor: "#007aff",
            secondaryBgColor: "#efeff4",
            sectionBgColor: "#ffffff",
            sectionHeaderTextColor: "#6d6d72",
            sectionSeparatorColor: "#c8c7cc",
            subtitleTextColor: "#8e8e93",
            textColor: "#000000"
        }
    },
    tdesktop: {
        dark: {
            accentTextColor: "#6ab2f2",
            bgColor: "#17212b",
            bottomBarBgColor: "#17212b",
            buttonColor: "#5288c1",
            buttonTextColor: "#ffffff",
            destructiveTextColor: "#ec3942",
            headerBgColor: "#17212b",
            hintColor: "#708499",
            linkColor: "#6ab3f3",
            secondaryBgColor: "#232e3c",
            sectionBgColor: "#17212b",
            sectionHeaderTextColor: "#6ab3f3",
            sectionSeparatorColor: "#111921",
            subtitleTextColor: "#708499",
            textColor: "#f5f5f5"
        },
        light: {
            accentTextColor: "#168acd",
            bgColor: "#ffffff",
            bottomBarBgColor: "#ffffff",
            buttonColor: "#40a7e3",
            buttonTextColor: "#ffffff",
            destructiveTextColor: "#d14e4e",
            headerBgColor: "#ffffff",
            hintColor: "#999999",
            linkColor: "#168acd",
            secondaryBgColor: "#f1f1f1",
            sectionBgColor: "#ffffff",
            sectionHeaderTextColor: "#168acd",
            sectionSeparatorColor: "#e7e7e7",
            subtitleTextColor: "#999999",
            textColor: "#000000"
        }
    }
};