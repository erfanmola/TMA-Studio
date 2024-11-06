
export type TelegramPlatform = 'tdesktop' | 'ios' | 'android' | 'web' | 'weba';

export type ThemeMode = 'dark' | 'light';

export type ThemeParams = {
    accent_text_color: string,
    bg_color: string,
    bottom_bar_bg_color: string,
    button_color: string,
    button_text_color: string,
    destructive_text_color: string,
    header_bg_color: string,
    hint_color: string,
    link_color: string,
    secondary_bg_color: string,
    section_bg_color: string,
    section_header_text_color: string,
    section_separator_color: string,
    subtitle_text_color: string,
    text_color: string,
};

export const TelegramThemes: {
    [key in TelegramPlatform]: {
        [key in ThemeMode]: ThemeParams
    }
} = {
    android: {
        dark: {
            accent_text_color: "#64b5ef",
            bg_color: "#212d3b",
            bottom_bar_bg_color: "#151e27",
            button_color: "#50a8eb",
            button_text_color: "#ffffff",
            destructive_text_color: "#ee686f",
            header_bg_color: "#242d39",
            hint_color: "#7d8b99",
            link_color: "#5eabe1",
            secondary_bg_color: "#151e27",
            section_bg_color: "#1d2733",
            section_header_text_color: "#79c4fc",
            section_separator_color: "#0d1218",
            subtitle_text_color: "#7b8790",
            text_color: "#ffffff"
        },
        light: {
            accent_text_color: "#1c93e3",
            bg_color: "#ffffff",
            bottom_bar_bg_color: "#f0f0f0",
            button_color: "#50a8eb",
            button_text_color: "#ffffff",
            destructive_text_color: "#cc2929",
            header_bg_color: "#527da3",
            hint_color: "#a8a8a8",
            link_color: "#2678b6",
            secondary_bg_color: "#f0f0f0",
            section_bg_color: "#ffffff",
            section_header_text_color: "#3a95d5",
            section_separator_color: "#d9d9d9",
            subtitle_text_color: "#82868a",
            text_color: "#222222"
        }
    },
    ios: {
        dark: {
            accent_text_color: "#3e88f7",
            bg_color: "#000000",
            bottom_bar_bg_color: "#1d1d1d",
            button_color: "#3e88f7",
            button_text_color: "#ffffff",
            destructive_text_color: "#eb5545",
            header_bg_color: "#1a1a1a",
            hint_color: "#98989e",
            link_color: "#3e88f7",
            secondary_bg_color: "#000000",
            section_bg_color: "#1c1c1d",
            section_header_text_color: "#8d8e93",
            section_separator_color: "#545458",
            subtitle_text_color: "#98989e",
            text_color: "#ffffff"
        },
        light: {
            accent_text_color: "#007aff",
            bg_color: "#ffffff",
            bottom_bar_bg_color: "#f2f2f2",
            button_color: "#007aff",
            button_text_color: "#ffffff",
            destructive_text_color: "#ff3b30",
            header_bg_color: "#f8f8f8",
            hint_color: "#8e8e93",
            link_color: "#007aff",
            secondary_bg_color: "#efeff4",
            section_bg_color: "#ffffff",
            section_header_text_color: "#6d6d72",
            section_separator_color: "#c8c7cc",
            subtitle_text_color: "#8e8e93",
            text_color: "#000000"
        }
    },
    tdesktop: {
        dark: {
            accent_text_color: "#6ab2f2",
            bg_color: "#17212b",
            bottom_bar_bg_color: "#17212b",
            button_color: "#5288c1",
            button_text_color: "#ffffff",
            destructive_text_color: "#ec3942",
            header_bg_color: "#17212b",
            hint_color: "#708499",
            link_color: "#6ab3f3",
            secondary_bg_color: "#232e3c",
            section_bg_color: "#17212b",
            section_header_text_color: "#6ab3f3",
            section_separator_color: "#111921",
            subtitle_text_color: "#708499",
            text_color: "#f5f5f5"
        },
        light: {
            accent_text_color: "#168acd",
            bg_color: "#ffffff",
            bottom_bar_bg_color: "#ffffff",
            button_color: "#40a7e3",
            button_text_color: "#ffffff",
            destructive_text_color: "#d14e4e",
            header_bg_color: "#ffffff",
            hint_color: "#999999",
            link_color: "#168acd",
            secondary_bg_color: "#f1f1f1",
            section_bg_color: "#ffffff",
            section_header_text_color: "#168acd",
            section_separator_color: "#e7e7e7",
            subtitle_text_color: "#999999",
            text_color: "#000000"
        }
    },
    web: {
        light: {
            bg_color: "#ffffff",
            button_color: "#3390ec",
            button_text_color: "#ffffff",
            hint_color: "#707579",
            link_color: "#00488f",
            secondary_bg_color: "#f4f4f5",
            text_color: "#000000",
            header_bg_color: "#ffffff",
            accent_text_color: "#3390ec",
            section_bg_color: "#ffffff",
            section_header_text_color: "#3390ec",
            subtitle_text_color: "#707579",
            destructive_text_color: "#df3f40",
            bottom_bar_bg_color: "",
            section_separator_color: ""
        },
        dark: {
            bg_color: "#212121",
            button_color: "#8774e1",
            button_text_color: "#ffffff",
            hint_color: "#aaaaaa",
            link_color: "#8774e1",
            secondary_bg_color: "#181818",
            text_color: "#ffffff",
            header_bg_color: "#212121",
            accent_text_color: "#8774e1",
            section_bg_color: "#212121",
            section_header_text_color: "#8774e1",
            subtitle_text_color: "#aaaaaa",
            destructive_text_color: "#ff595a",
            bottom_bar_bg_color: "",
            section_separator_color: ""
        }
    },
    weba: {
        light: {
            bg_color: "#ffffff",
            text_color: "#000000",
            hint_color: "#707579",
            link_color: "#3390ec",
            button_color: "#3390ec",
            button_text_color: "#ffffff",
            secondary_bg_color: "#f4f4f5",
            header_bg_color: "#ffffff",
            accent_text_color: "#3390ec",
            section_bg_color: "#ffffff",
            section_header_text_color: "#707579",
            subtitle_text_color: "#707579",
            destructive_text_color: "#e53935",
            bottom_bar_bg_color: "",
            section_separator_color: ""
        },
        dark: {
            bg_color: "#212121",
            text_color: "#ffffff",
            hint_color: "#aaaaaa",
            link_color: "#8774e1",
            button_color: "#8774e1",
            button_text_color: "#ffffff",
            secondary_bg_color: "#0f0f0f",
            header_bg_color: "#212121",
            accent_text_color: "#8774e1",
            section_bg_color: "#212121",
            section_header_text_color: "#aaaaaa",
            subtitle_text_color: "#aaaaaa",
            destructive_text_color: "#e53935",
            bottom_bar_bg_color: "",
            section_separator_color: ""
        },
    }
};

for (const platform in TelegramThemes) {
    for (const mode in TelegramThemes[platform as TelegramPlatform]) {
        for (const key in TelegramThemes[platform as TelegramPlatform][mode as ThemeMode]) {
            document.documentElement.style.setProperty(`--tg-var-${platform}-${mode}-${key}`, TelegramThemes[platform as TelegramPlatform][mode as ThemeMode][key as keyof ThemeParams]);
        }
    }
}