export interface SecretStore {
  writeSecret(secretId: string, value: string): Promise<string>;
  readSecret(secretName: string): Promise<string>;
}

export interface LinePlatformClient {
  verifyMessagingApiToken(channelAccessToken: string): Promise<LineTokenVerifyResult>;
  createLiffApp(channelAccessToken: string, payload: LineCreateLiffAppPayload): Promise<LineCreateLiffAppResult>;
  issueStatelessChannelAccessToken(channelId: string, channelSecret: string): Promise<string>;
}

export interface LineTokenVerifyResult {
  clientId?: string;
  expiresIn?: number;
  scope?: string;
}

export interface LineCreateLiffAppPayload {
  view: {
    type: "compact" | "tall" | "full";
    url: string;
    moduleMode: boolean;
  };
  description: string;
  features: {
    qrCode: boolean;
  };
  scope: string[];
  botPrompt: "normal" | "aggressive" | "none";
}

export interface LineCreateLiffAppResult {
  liffId: string;
}
