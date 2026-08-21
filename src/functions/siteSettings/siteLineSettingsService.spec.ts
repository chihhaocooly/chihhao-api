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
    updateLiffApp: jest.fn(),
    deleteLiffApp: jest.fn(),
    issueStatelessChannelAccessToken: jest.fn(),
  };
  const existingLiffApp = {
    id: "site-liff-app-id",
    liffId: "1234567890-AbCdEf",
    description: "會員中心",
    endpointUrl: "https://example.com/liff",
    viewType: "full",
    scope: ["openid", "profile"],
    botPrompt: "normal",
    moduleMode: false,
    qrCode: false,
    createdByUserId: "admin-user",
    createdAt: new Date("2026-08-18T00:00:00.000Z"),
    updatedAt: new Date("2026-08-18T01:00:00.000Z"),
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
  const findLiffAppById = jest.fn(async () => ({ ...existingLiffApp }));
  const saveLiffApp = jest.fn(async (app) => ({
    ...app,
    updatedAt: setting.updatedAt,
  }));
  const deleteLiffAppById = jest.fn(async () => ({ affected: 1 }));

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
      findById: findLiffAppById,
      save: saveLiffApp,
      deleteById: deleteLiffAppById,
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

  it("updates a LIFF app in LINE before saving local metadata", async () => {
    secretStore.readSecret.mockResolvedValue("line-login-secret");
    lineClient.issueStatelessChannelAccessToken.mockResolvedValue("stateless-token");
    lineClient.updateLiffApp.mockResolvedValue();

    const result = await new SiteLineSettingsService(secretStore, lineClient).updateLiffApp("site-liff-app-id", {
      description: "會員資料",
      endpointUrl: "https://example.com/member",
      viewType: "tall",
      scope: ["openid", "profile"],
      botPrompt: "none",
      moduleMode: true,
      qrCode: true,
    });

    expect(lineClient.updateLiffApp).toHaveBeenCalledWith("stateless-token", "1234567890-AbCdEf", expect.objectContaining({
      description: "會員資料",
      view: {
        type: "tall",
        url: "https://example.com/member",
        moduleMode: true,
      },
      features: {
        qrCode: true,
      },
    }));
    expect(saveLiffApp).toHaveBeenCalledWith(expect.objectContaining({
      description: "會員資料",
      endpointUrl: "https://example.com/member",
      viewType: "tall",
      botPrompt: "none",
      moduleMode: true,
      qrCode: true,
    }));
    expect(result.item.description).toBe("會員資料");
  });

  it("requires matching LIFF ID before deleting a LIFF app", async () => {
    await expect(new SiteLineSettingsService(secretStore, lineClient).deleteLiffApp(
      "site-liff-app-id",
      "wrong-liff-id",
    )).rejects.toThrow("請輸入完整 LIFF ID 以確認刪除");

    expect(lineClient.issueStatelessChannelAccessToken).not.toHaveBeenCalled();
    expect(lineClient.deleteLiffApp).not.toHaveBeenCalled();
    expect(deleteLiffAppById).not.toHaveBeenCalled();
  });

  it("deletes a LIFF app from LINE before deleting local metadata", async () => {
    secretStore.readSecret.mockResolvedValue("line-login-secret");
    lineClient.issueStatelessChannelAccessToken.mockResolvedValue("stateless-token");
    lineClient.deleteLiffApp.mockResolvedValue();

    const result = await new SiteLineSettingsService(secretStore, lineClient).deleteLiffApp(
      "site-liff-app-id",
      "1234567890-AbCdEf",
    );

    expect(lineClient.deleteLiffApp).toHaveBeenCalledWith("stateless-token", "1234567890-AbCdEf");
    expect(deleteLiffAppById).toHaveBeenCalledWith("site-liff-app-id");
    expect(result.deleted).toBe(true);
  });
});
