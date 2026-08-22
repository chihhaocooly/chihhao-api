import {
  CreateSiteLiffAppRequest,
  CreateSiteLiffAppResponse,
  GetSiteLineSettingsResponse,
  SiteLiffApp,
  SiteLiffAppRepository,
  SiteLiffAppDto,
  SiteLiffScope,
  SiteLineSettingRepository,
  siteLiffBotPrompts,
  siteLiffScopes,
  siteLiffViewTypes,
  UpdateSiteLineSettingsRequest,
  UpdateSiteLineSettingsResponse,
  VerifyMessageApiTokenResponse,
} from "@chihhaocooly/chihhao-package";
import { MyError } from "../../@types/my-error";
import { AxiosLinePlatformClient } from "./linePlatformClient";
import { SecretManagerStore } from "./secretManagerStore";
import { toSiteLiffAppDto, toSiteLineSettingsDto } from "./siteLineSettingsMapper";
import { LinePlatformClient, SecretStore } from "./siteSettingsTypes";

const LINE_LOGIN_CHANNEL_SECRET_ID = "chihhao-line-login-channel-secret";
const MESSAGE_API_ACCESS_TOKEN_SECRET_ID = "chihhao-message-api-channel-access-token";
const MESSAGE_API_CHANNEL_SECRET_ID = "chihhao-message-api-channel-secret";

interface UpdateSiteLiffAppResponse {
  item: SiteLiffAppDto;
}

interface DeleteSiteLiffAppResponse {
  deleted: true;
}

interface SiteLiffAppRepositoryWithMutations {
  findById(id: string): Promise<SiteLiffApp | null>;
  save(siteLiffApp: SiteLiffApp): Promise<SiteLiffApp>;
  deleteById(id: string): Promise<unknown>;
}

export class SiteLineSettingsService {
  constructor(
    private readonly secretStore: SecretStore = new SecretManagerStore(),
    private readonly lineClient: LinePlatformClient = new AxiosLinePlatformClient(),
  ) {}

  async getSettings(): Promise<GetSiteLineSettingsResponse> {
    const setting = await new SiteLineSettingRepository().findCurrent();
    const liffApps = await new SiteLiffAppRepository().findAll();
    const primaryLiffAppId = setting?.primaryLiffAppId ?? null;

    return {
      settings: toSiteLineSettingsDto(setting),
      liffApps: liffApps.map((app) => toSiteLiffAppDto(app, primaryLiffAppId)),
    };
  }

  async updateSettings(payload: Partial<UpdateSiteLineSettingsRequest>, updatedByUserId: string | null): Promise<UpdateSiteLineSettingsResponse> {
    const repository = new SiteLineSettingRepository();
    const setting = await repository.getOrCreate();

    if ("lineLoginChannelId" in payload) {
      setting.lineLoginChannelId = normalizeNullableText(payload.lineLoginChannelId);
    }

    if ("botBasicId" in payload) {
      setting.botBasicId = normalizeNullableText(payload.botBasicId);
    }

    if ("primaryLiffAppId" in payload) {
      setting.primaryLiffAppId = await this.normalizePrimaryLiffAppId(payload.primaryLiffAppId);
    }

    const lineLoginChannelSecret = normalizeSecret(payload.lineLoginChannelSecret);
    if (lineLoginChannelSecret) {
      setting.lineLoginChannelSecretSecretName = await this.secretStore.writeSecret(LINE_LOGIN_CHANNEL_SECRET_ID, lineLoginChannelSecret);
      setting.lineLoginChannelSecretMask = maskSecret(lineLoginChannelSecret);
    }

    const messageApiToken = normalizeSecret(payload.messageApiChannelAccessToken);
    if (messageApiToken) {
      setting.messageApiChannelAccessTokenSecretName = await this.secretStore.writeSecret(MESSAGE_API_ACCESS_TOKEN_SECRET_ID, messageApiToken);
      setting.messageApiChannelAccessTokenMask = maskSecret(messageApiToken);
    }

    const messageApiSecret = normalizeSecret(payload.messageApiChannelSecret);
    if (messageApiSecret) {
      setting.messageApiChannelSecretSecretName = await this.secretStore.writeSecret(MESSAGE_API_CHANNEL_SECRET_ID, messageApiSecret);
      setting.messageApiChannelSecretMask = maskSecret(messageApiSecret);
    }

    setting.updatedByUserId = updatedByUserId;
    const savedSetting = await repository.save(setting);

    return {
      settings: toSiteLineSettingsDto(savedSetting),
    };
  }

  async verifyMessageApiToken(): Promise<VerifyMessageApiTokenResponse> {
    const token = await this.getMessageApiChannelAccessToken();
    const result = await this.lineClient.verifyMessagingApiToken(token);

    return {
      ok: true,
      message: "Messaging API token 驗證成功",
      clientId: result.clientId,
      expiresIn: result.expiresIn,
      scope: result.scope,
    };
  }

  async createLiffApp(payload: Partial<CreateSiteLiffAppRequest>, createdByUserId: string | null): Promise<CreateSiteLiffAppResponse> {
    const request = validateCreateLiffAppRequest(payload);
    const lineLoginCredentials = await this.getLineLoginCredentials();
    const channelAccessToken = await this.lineClient.issueStatelessChannelAccessToken(
      lineLoginCredentials.channelId,
      lineLoginCredentials.channelSecret,
    );

    const result = await this.lineClient.createLiffApp(channelAccessToken, buildLineLiffPayload(request));

    const app = new SiteLiffApp();
    app.liffId = result.liffId;
    app.description = request.description;
    app.endpointUrl = request.endpointUrl;
    app.viewType = request.viewType;
    app.scope = request.scope;
    app.botPrompt = request.botPrompt;
    app.moduleMode = request.moduleMode;
    app.qrCode = request.qrCode;
    app.createdByUserId = createdByUserId;

    const savedApp = await new SiteLiffAppRepository().create(app);

    return {
      item: toSiteLiffAppDto(savedApp),
    };
  }

  async updateLiffApp(id: string, payload: Partial<CreateSiteLiffAppRequest>): Promise<UpdateSiteLiffAppResponse> {
    const repository = this.getLiffAppRepository();
    const app = await repository.findById(id);
    if (!app) {
      throw new MyError(404, "LIFF app 不存在");
    }

    const request = validateCreateLiffAppRequest(payload);
    const lineLoginCredentials = await this.getLineLoginCredentials();
    const channelAccessToken = await this.lineClient.issueStatelessChannelAccessToken(
      lineLoginCredentials.channelId,
      lineLoginCredentials.channelSecret,
    );

    await this.lineClient.updateLiffApp(channelAccessToken, app.liffId, buildLineLiffPayload(request));

    app.description = request.description;
    app.endpointUrl = request.endpointUrl;
    app.viewType = request.viewType;
    app.scope = request.scope;
    app.botPrompt = request.botPrompt;
    app.moduleMode = request.moduleMode;
    app.qrCode = request.qrCode;

    const savedApp = await repository.save(app);
    const setting = await new SiteLineSettingRepository().findCurrent();

    return {
      item: toSiteLiffAppDto(savedApp, setting?.primaryLiffAppId ?? null),
    };
  }

  async deleteLiffApp(id: string, confirmLiffId: string | undefined): Promise<DeleteSiteLiffAppResponse> {
    const repository = this.getLiffAppRepository();
    const app = await repository.findById(id);
    if (!app) {
      throw new MyError(404, "LIFF app 不存在");
    }

    if (!confirmLiffId || confirmLiffId !== app.liffId) {
      throw new MyError(400, "請輸入完整 LIFF ID 以確認刪除");
    }

    const setting = await new SiteLineSettingRepository().findCurrent();
    if (setting?.primaryLiffAppId === app.id) {
      throw new MyError(409, "此 LIFF app 已設為主要入口，請先指定其他主要 LIFF app");
    }

    const lineLoginCredentials = await this.getLineLoginCredentials();
    const channelAccessToken = await this.lineClient.issueStatelessChannelAccessToken(
      lineLoginCredentials.channelId,
      lineLoginCredentials.channelSecret,
    );

    await this.lineClient.deleteLiffApp(channelAccessToken, app.liffId);
    await repository.deleteById(id);

    return {
      deleted: true,
    };
  }

  async getMessageApiChannelAccessToken(): Promise<string> {
    const setting = await new SiteLineSettingRepository().findCurrent();
    if (setting?.messageApiChannelAccessTokenSecretName) {
      return this.secretStore.readSecret(setting.messageApiChannelAccessTokenSecretName);
    }

    const fallbackToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (fallbackToken) {
      return fallbackToken;
    }

    throw new MyError(400, "Messaging API channel access token 尚未設定");
  }

  async getMessageApiChannelSecret(): Promise<string> {
    const setting = await new SiteLineSettingRepository().findCurrent();
    if (setting?.messageApiChannelSecretSecretName) {
      return this.secretStore.readSecret(setting.messageApiChannelSecretSecretName);
    }

    const fallbackSecret = process.env.LINE_CHANNEL_SECRET;
    if (fallbackSecret) {
      return fallbackSecret;
    }

    throw new MyError(400, "Messaging API channel secret 尚未設定");
  }

  private async getLineLoginCredentials(): Promise<{ channelId: string; channelSecret: string }> {
    const setting = await new SiteLineSettingRepository().findCurrent();
    const channelId = setting?.lineLoginChannelId?.trim();

    if (!channelId || !setting?.lineLoginChannelSecretSecretName) {
      throw new MyError(400, "LINE Login channel 尚未設定");
    }

    return {
      channelId,
      channelSecret: await this.secretStore.readSecret(setting.lineLoginChannelSecretSecretName),
    };
  }

  private getLiffAppRepository(): SiteLiffAppRepositoryWithMutations {
    return new SiteLiffAppRepository() as unknown as SiteLiffAppRepositoryWithMutations;
  }

  private async normalizePrimaryLiffAppId(value: string | null | undefined): Promise<string | null> {
    const primaryLiffAppId = normalizeNullableText(value);
    if (!primaryLiffAppId) {
      return null;
    }

    const app = await new SiteLiffAppRepository().findById(primaryLiffAppId);
    if (!app) {
      throw new MyError(400, "主要 LIFF app 不存在");
    }

    return app.id;
  }
}

export const maskSecret = (value: string): string => {
  const trimmedValue = value.trim();
  if (trimmedValue.length <= 8) {
    return "********";
  }

  return `${trimmedValue.slice(0, 4)}...${trimmedValue.slice(-4)}`;
};

const normalizeNullableText = (value: string | null | undefined): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const normalizeSecret = (value: string | null | undefined): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const validateCreateLiffAppRequest = (payload: Partial<CreateSiteLiffAppRequest>): CreateSiteLiffAppRequest => {
  const description = payload.description?.trim();
  const endpointUrl = payload.endpointUrl?.trim();
  const viewType = payload.viewType ?? "full";
  const scope = payload.scope?.length ? payload.scope : (["openid", "profile"] as SiteLiffScope[]);
  const botPrompt = payload.botPrompt ?? "normal";

  if (!description) {
    throw new MyError(400, "LIFF 名稱為必填");
  }

  if (!endpointUrl || !isValidLiffEndpointUrl(endpointUrl)) {
    throw new MyError(400, "LIFF endpoint URL 必須是 https 且不可包含 URL fragment");
  }

  if (!siteLiffViewTypes.includes(viewType)) {
    throw new MyError(400, "LIFF view type 不支援");
  }

  if (!scope.every(isSiteLiffScope)) {
    throw new MyError(400, "LIFF scope 不支援");
  }

  if (!siteLiffBotPrompts.includes(botPrompt)) {
    throw new MyError(400, "LIFF bot prompt 不支援");
  }

  return {
    description,
    endpointUrl,
    viewType,
    scope,
    botPrompt,
    moduleMode: payload.moduleMode ?? false,
    qrCode: payload.qrCode ?? false,
  };
};

const buildLineLiffPayload = (request: CreateSiteLiffAppRequest) => ({
  view: {
    type: request.viewType,
    url: request.endpointUrl,
    moduleMode: request.moduleMode,
  },
  description: request.description,
  features: {
    qrCode: request.qrCode,
  },
  scope: request.scope,
  botPrompt: request.botPrompt,
});

const isSiteLiffScope = (value: string): value is SiteLiffScope => {
  return siteLiffScopes.includes(value as SiteLiffScope);
};

const isValidLiffEndpointUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.hash;
  } catch {
    return false;
  }
};
