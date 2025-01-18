import { Client } from "@line/bot-sdk";

export class LineMessageApiService {
    constructor() {
    }

    static async SetDefaultRichmenu(lineRichmenuId: string) {
        // 這裡實作設定預設richmenu的邏輯

        const client = new Client({
            channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN as string,
            channelSecret: process.env.LINE_CHANNEL_SECRET
        });

        // 設定預設richmenu
        const response = await client.setDefaultRichMenu(lineRichmenuId);
        return response;
    }

}