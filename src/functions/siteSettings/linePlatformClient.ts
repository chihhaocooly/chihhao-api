import axios, { AxiosError } from "axios";
import { MyError } from "../../@types/my-error";
import {
  LineCreateLiffAppPayload,
  LineCreateLiffAppResult,
  LinePlatformClient,
  LineTokenVerifyResult,
} from "./siteSettingsTypes";

interface LineIssueTokenResponse {
  access_token: string;
}

interface LineVerifyTokenResponse {
  client_id?: string;
  expires_in?: number;
  scope?: string;
}

export class AxiosLinePlatformClient implements LinePlatformClient {
  async issueStatelessChannelAccessToken(channelId: string, channelSecret: string): Promise<string> {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: channelId,
      client_secret: channelSecret,
    });

    try {
      const response = await axios.post<LineIssueTokenResponse>("https://api.line.me/oauth2/v3/token", body.toString(), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      return response.data.access_token;
    } catch (error) {
      throw this.toLineError(error, "LINE Login channel 驗證失敗");
    }
  }

  async verifyMessagingApiToken(channelAccessToken: string): Promise<LineTokenVerifyResult> {
    const body = new URLSearchParams({
      access_token: channelAccessToken,
    });

    try {
      const response = await axios.post<LineVerifyTokenResponse>("https://api.line.me/v2/oauth/verify", body.toString(), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      return {
        clientId: response.data.client_id,
        expiresIn: response.data.expires_in,
        scope: response.data.scope,
      };
    } catch (error) {
      throw this.toLineError(error, "Messaging API token 驗證失敗");
    }
  }

  async createLiffApp(channelAccessToken: string, payload: LineCreateLiffAppPayload): Promise<LineCreateLiffAppResult> {
    try {
      const response = await axios.post<LineCreateLiffAppResult>("https://api.line.me/liff/v1/apps", payload, {
        headers: {
          Authorization: `Bearer ${channelAccessToken}`,
          "Content-Type": "application/json",
        },
      });

      return response.data;
    } catch (error) {
      throw this.toLineError(error, "LIFF app 建立失敗");
    }
  }

  private toLineError(error: unknown, fallbackMessage: string): MyError {
    if (this.isAxiosError(error)) {
      const status = error.response?.status;
      if (status === 400) {
        return new MyError(400, fallbackMessage);
      }

      if (status === 401) {
        return new MyError(400, "LINE channel 憑證無效");
      }
    }

    return new MyError(502, fallbackMessage);
  }

  private isAxiosError(error: unknown): error is AxiosError {
    return typeof error === "object" && error !== null && (error as AxiosError).isAxiosError === true;
  }
}
