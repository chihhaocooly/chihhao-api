import { Client } from "@line/bot-sdk";
import { Readable } from "stream";
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

    static async GetRichmenuList() {
        const client = await this.createClient();
        return await client.getRichMenuList();
    }

    static async GetRichmenuImage(lineRichmenuId: string): Promise<Readable> {
        const client = await this.createClient();
        return await client.getRichMenuImage(lineRichmenuId);
    }

    static async GetDefaultRichmenuId(): Promise<string | null> {
        try {
            const client = await this.createClient();
            return await client.getDefaultRichMenuId();
        } catch {
            return null;
        }
    }

    private static async createClient(): Promise<Client> {
        const channelAccessToken = await new SiteLineSettingsService().getMessageApiChannelAccessToken();

        return new Client({
            channelAccessToken,
            channelSecret: process.env.LINE_CHANNEL_SECRET
        });
    }

}
