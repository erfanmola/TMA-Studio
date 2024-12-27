
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

export const deserializeObject = (object: any): any => {
    return JSON.parse(JSON.stringify(object));
};

export const ksort = (obj) => {
    const sortedKeys = Object.keys(obj).sort();
    const sortedObj = {};

    for (const key of sortedKeys) {
        sortedObj[key] = obj[key];
    }

    return sortedObj;
};

export const buffer2Hex = (buffer) => {
    return [...new Uint8Array(buffer)]
        .map(x => x.toString(16).padStart(2, '0'))
        .join('');
};

export const hex2Buffer = (hexString) => {
    const bytes: number[] = [];
    for (let i = 0; i < hexString.length; i += 2) {
        bytes.push(Number.parseInt(hexString.substr(i, 2), 16));
    }
    return new Uint8Array(bytes);
};