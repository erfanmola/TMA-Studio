import { TelegramThemes, type TelegramPlatform, type ThemeMode } from "./themes";
import hmac from 'js-crypto-hmac';

import type { User } from "@renderer/types";
import { buffer2Hex, deserializeObject, hex2Buffer, ksort } from "./general";

export const TGWebAppVersion = 7.10;

export const tgWebAppData = async (platform: TelegramPlatform, mode: ThemeMode, user: User | undefined, token: string | undefined): Promise<string> => {
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	const webAppData = {
        auth_date: Math.floor(Date.now() / 1000).toString(),
        query_id: 'SomeRandomQueryID',
        user: JSON.stringify(user ?? {
            id: 1234567890,
            first_name: 'John',
            language_code: 'en',
        } as User),
        hash: '',
	};

    webAppData.hash = await tgWebAppDataHash(webAppData, token ?? 'Nothing!');

    const extraData = {
        tgWebAppVersion: TGWebAppVersion.toString(),
        tgWebAppPlatform: platform,
        tgWebAppThemeParams: JSON.stringify(TelegramThemes[platform][mode]),
    };

    const webAppDataEncoded = new URLSearchParams(webAppData).toString();

	return `#${new URLSearchParams({
        tgWebAppData: webAppDataEncoded,
        ...extraData
    })}`;
};


// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export const tgWebAppDataHash = async (webAppData: any, token: string) => {
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    const initData: any = ksort(deserializeObject(webAppData));
    // biome-ignore lint/performance/noDelete: <explanation>
    delete initData.hash;

    const initDataString = Object.entries(initData)
    .map(([key, value]) => {
        value = typeof value === 'object' ? JSON.stringify(value, null, 0) : value;
        return `${key}=${value}`;
    })
    .join('\n');

    return buffer2Hex(await hmac.compute(await hmac.compute(new TextEncoder().encode('WebAppData'), new TextEncoder().encode(token), 'SHA-256'), new TextEncoder().encode(initDataString), 'SHA-256'));
}