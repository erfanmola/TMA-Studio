
export const stringToColor = (str: string): string => {
    let hash = 0;

    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    let color = '#';
    for (let i = 0; i < 3; i++) {
        const value = (hash >> (i * 8)) & 0xFF;
        color += (`00${value.toString(16)}`).slice(-2);
    }

    return color;
};

export const getNameInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).map(part => Array.from(part)[0]);

    if (parts.length === 0) {
        return '';
    }

    return parts.length === 1 ? parts[0] : `${parts[0]}${parts[parts.length - 1]}`;
};

export const stringToColorDark = (str: string): string => {
    let hash = 0;

    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    let color = '#';
    for (let i = 0; i < 3; i++) {
        let value = (hash >> (i * 8)) & 0xFF;

        value = Math.min(value, 180);

        color += (`00${value.toString(16)}`).slice(-2);
    }

    return color;
};

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export const deserializeObject = (object: any): any => {
    return JSON.parse(JSON.stringify(object));
};
