import axios from 'axios';
import { Client } from "@line/bot-sdk";
import { RichMenu } from "@line/bot-sdk/dist/types";
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

    static async CreateRichmenu(richMenu: RichMenu): Promise<string> {
        return (await this.menuRequest<{ richMenuId: string }>('post', 'https://api.line.me/v2/bot/richmenu', richMenu)).richMenuId;
    }

    static async SetRichmenuImage(lineRichmenuId: string, image: Buffer, contentType: string) {
        return this.menuRequest('post', `https://api-data.line.me/v2/bot/richmenu/${encodeURIComponent(lineRichmenuId)}/content`, image, contentType);
    }

    static async DeleteRichmenu(lineRichmenuId: string) {
        return this.menuRequest('delete', `https://api.line.me/v2/bot/richmenu/${encodeURIComponent(lineRichmenuId)}`);
    }

    static async GetDefaultRichmenuId(): Promise<string | null> {
        try {
            const client = await this.createClient();
            return await client.getDefaultRichMenuId();
        } catch {
            return null;
        }
    }

    private static async menuRequest<T>(method: 'post' | 'delete', url: string, data?: unknown, contentType = 'application/json'): Promise<T> {
        const token = await new SiteLineSettingsService().getMessageApiChannelAccessToken();
        const result = await axios.request<T>({ method, url, data, timeout: 10000, headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType } });
        return result.data;
    }

    private static async createClient(): Promise<Client> {
        const channelAccessToken = await new SiteLineSettingsService().getMessageApiChannelAccessToken();

        return new Client({
            channelAccessToken,
            channelSecret: process.env.LINE_CHANNEL_SECRET
        });
    }

}
