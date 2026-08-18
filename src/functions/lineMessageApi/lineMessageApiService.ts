import { Client } from "@line/bot-sdk";
import { SiteLineSettingsService } from "../siteSettings";

export class LineMessageApiService {
    constructor() {
    }

    static async SetDefaultRichmenu(lineRichmenuId: string) {
        // 這裡實作設定預設richmenu的邏輯
        const channelAccessToken = await new SiteLineSettingsService().getMessageApiChannelAccessToken();

        const client = new Client({
            channelAccessToken,
            channelSecret: process.env.LINE_CHANNEL_SECRET
        });

        // 設定預設richmenu
        const response = await client.setDefaultRichMenu(lineRichmenuId);
        return response;
    }

}
