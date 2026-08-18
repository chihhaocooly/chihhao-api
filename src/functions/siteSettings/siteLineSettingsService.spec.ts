import { SiteLineSettingsService } from "./siteLineSettingsService";
import { LinePlatformClient, SecretStore } from "./siteSettingsTypes";

jest.mock("@chihhaocooly/chihhao-package", () => {
  class SiteLiffApp {
    liffId = "";
    description = "";
    endpointUrl = "";
    viewType = "full";
    scope = [];
    botPrompt = "normal";
    moduleMode = false;
    qrCode = false;
    createdByUserId = null;
  }

  return {
    SiteLiffApp,
    SiteLineSettingRepository: jest.fn(),
    SiteLiffAppRepository: jest.fn(),
    siteLiffBotPrompts: ["normal", "aggressive", "none"],
    siteLiffScopes: ["openid", "email", "profile", "chat_message.write"],
    siteLiffViewTypes: ["compact", "tall", "full"],
  };
});

import {
  SiteLiffAppRepository,
  SiteLineSettingRepository,
} from "@chihhaocooly/chihhao-package";

const SiteLineSettingRepositoryMock = SiteLineSettingRepository as jest.MockedClass<typeof SiteLineSettingRepository>;
const SiteLiffAppRepositoryMock = SiteLiffAppRepository as jest.MockedClass<typeof SiteLiffAppRepository>;

describe("SiteLineSettingsService", () => {
  const secretStore: jest.Mocked<SecretStore> = {
    writeSecret: jest.fn(),
    readSecret: jest.fn(),
  };
  const lineClient: jest.Mocked<LinePlatformClient> = {
    verifyMessagingApiToken: jest.fn(),
    createLiffApp: jest.fn(),
    issueStatelessChannelAccessToken: jest.fn(),
  };
  const setting = {
    settingKey: "default",
    lineLoginChannelId: "login-channel-id",
    lineLoginChannelSecretSecretName: "projects/p/secrets/login",
    lineLoginChannelSecretMask: "secr...cret",
    messageApiChannelAccessTokenSecretName: "projects/p/secrets/token",
    messageApiChannelAccessTokenMask: "toke...oken",
    botBasicId: "@bot",
    updatedByUserId: "user-1",
    createdAt: new Date("2026-08-18T00:00:00.000Z"),
    updatedAt: new Date("2026-08-18T01:00:00.000Z"),
  };
  const saveSetting = jest.fn(async (nextSetting) => ({
    ...nextSetting,
    createdAt: setting.createdAt,
    updatedAt: setting.updatedAt,
  }));
  const createLiffApp = jest.fn(async (app) => ({
    ...app,
    id: "site-liff-app-id",
    createdAt: setting.createdAt,
    updatedAt: setting.updatedAt,
  }));

  beforeEach(() => {
    jest.clearAllMocks();
    SiteLineSettingRepositoryMock.mockImplementation(() => ({
      findCurrent: jest.fn().mockResolvedValue(setting),
      getOrCreate: jest.fn().mockResolvedValue({ ...setting }),
      save: saveSetting,
    } as unknown as SiteLineSettingRepository));
    SiteLiffAppRepositoryMock.mockImplementation(() => ({
      findAll: jest.fn().mockResolvedValue([]),
      create: createLiffApp,
    } as unknown as SiteLiffAppRepository));
  });

  it("updates secrets through the secret store and does not return plain secret values", async () => {
    secretStore.writeSecret
      .mockResolvedValueOnce("projects/p/secrets/login")
      .mockResolvedValueOnce("projects/p/secrets/token");

    const result = await new SiteLineSettingsService(secretStore, lineClient).updateSettings({
      lineLoginChannelId: " login-channel-id ",
      lineLoginChannelSecret: "line-login-secret",
      messageApiChannelAccessToken: "message-api-token",
      botBasicId: " @bot ",
    }, "admin-user");

    expect(secretStore.writeSecret).toHaveBeenCalledTimes(2);
    expect(saveSetting).toHaveBeenCalledWith(expect.objectContaining({
      lineLoginChannelId: "login-channel-id",
      botBasicId: "@bot",
      updatedByUserId: "admin-user",
    }));
    expect(JSON.stringify(result)).not.toContain("line-login-secret");
    expect(JSON.stringify(result)).not.toContain("message-api-token");
    expect(result.settings.hasLineLoginChannelSecret).toBe(true);
    expect(result.settings.hasMessageApiChannelAccessToken).toBe(true);
  });

  it("rejects LIFF endpoint URLs that are not https", async () => {
    await expect(new SiteLineSettingsService(secretStore, lineClient).createLiffApp({
      description: "會員中心",
      endpointUrl: "http://example.com/liff",
      viewType: "full",
      scope: ["openid", "profile"],
      botPrompt: "normal",
      moduleMode: false,
      qrCode: false,
    }, "admin-user")).rejects.toThrow("LIFF endpoint URL 必須是 https 且不可包含 URL fragment");

    expect(lineClient.issueStatelessChannelAccessToken).not.toHaveBeenCalled();
    expect(createLiffApp).not.toHaveBeenCalled();
  });

  it("creates a LIFF app with LINE Login credentials and stores metadata", async () => {
    secretStore.readSecret.mockResolvedValue("line-login-secret");
    lineClient.issueStatelessChannelAccessToken.mockResolvedValue("stateless-token");
    lineClient.createLiffApp.mockResolvedValue({ liffId: "1234567890-AbCdEf" });

    const result = await new SiteLineSettingsService(secretStore, lineClient).createLiffApp({
      description: "會員中心",
      endpointUrl: "https://example.com/liff",
      viewType: "full",
      scope: ["openid", "profile"],
      botPrompt: "normal",
      moduleMode: false,
      qrCode: false,
    }, "admin-user");

    expect(lineClient.issueStatelessChannelAccessToken).toHaveBeenCalledWith("login-channel-id", "line-login-secret");
    expect(lineClient.createLiffApp).toHaveBeenCalledWith("stateless-token", expect.objectContaining({
      description: "會員中心",
      view: {
        type: "full",
        url: "https://example.com/liff",
        moduleMode: false,
      },
    }));
    expect(createLiffApp).toHaveBeenCalledWith(expect.objectContaining({
      liffId: "1234567890-AbCdEf",
      createdByUserId: "admin-user",
    }));
    expect(result.item.liffId).toBe("1234567890-AbCdEf");
  });
});
