import { LineAuthService, buildFirebaseUid } from "./lineAuthService";

jest.mock("@chihhaocooly/chihhao-package", () => ({
  SiteLineSettingRepository: jest.fn(),
}));

import { SiteLineSettingRepository } from "@chihhaocooly/chihhao-package";

const SiteLineSettingRepositoryMock = SiteLineSettingRepository as jest.MockedClass<typeof SiteLineSettingRepository>;

describe("LineAuthService", () => {
  const verifyIdToken = jest.fn();
  const createCustomToken = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.LINE_LOGIN_CHANNEL_ID;
    SiteLineSettingRepositoryMock.mockImplementation(() => ({
      findCurrent: jest.fn().mockResolvedValue({
        lineLoginChannelId: " 2011161809 ",
      }),
    } as unknown as SiteLineSettingRepository));
  });

  it("verifies LINE ID token and returns a Firebase custom token", async () => {
    verifyIdToken.mockResolvedValue({ sub: "U1234567890abcdef" });
    createCustomToken.mockResolvedValue("firebase-custom-token");

    const result = await new LineAuthService({ verifyIdToken }, { createCustomToken }).loginWithLineIdToken({
      site: " chihhao ",
      idToken: " line-id-token ",
    });

    expect(verifyIdToken).toHaveBeenCalledWith("line-id-token", "2011161809");
    expect(createCustomToken).toHaveBeenCalledWith("line:chihhao:U1234567890abcdef", {
      provider: "line",
      site: "chihhao",
      lineUserId: "U1234567890abcdef",
    });
    expect(result).toEqual({
      status: "success",
      token: "firebase-custom-token",
    });
  });

  it("uses LINE_LOGIN_CHANNEL_ID when database setting is empty", async () => {
    process.env.LINE_LOGIN_CHANNEL_ID = "env-channel-id";
    SiteLineSettingRepositoryMock.mockImplementation(() => ({
      findCurrent: jest.fn().mockResolvedValue(null),
    } as unknown as SiteLineSettingRepository));
    verifyIdToken.mockResolvedValue({ sub: "line-user-id" });
    createCustomToken.mockResolvedValue("firebase-custom-token");

    await new LineAuthService({ verifyIdToken }, { createCustomToken }).loginWithLineIdToken({
      site: "chihhao",
      idToken: "line-id-token",
    });

    expect(verifyIdToken).toHaveBeenCalledWith("line-id-token", "env-channel-id");
  });

  it("rejects missing ID token before calling LINE", async () => {
    await expect(new LineAuthService({ verifyIdToken }, { createCustomToken }).loginWithLineIdToken({
      site: "chihhao",
      idToken: " ",
    })).rejects.toThrow("LINE ID token 為必填");

    expect(verifyIdToken).not.toHaveBeenCalled();
    expect(createCustomToken).not.toHaveBeenCalled();
  });

  it("rejects missing LINE Login channel settings", async () => {
    SiteLineSettingRepositoryMock.mockImplementation(() => ({
      findCurrent: jest.fn().mockResolvedValue(null),
    } as unknown as SiteLineSettingRepository));

    await expect(new LineAuthService({ verifyIdToken }, { createCustomToken }).loginWithLineIdToken({
      site: "chihhao",
      idToken: "line-id-token",
    })).rejects.toThrow("LINE Login channel 尚未設定");

    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("builds a Firebase uid under the length limit", () => {
    const longSite = "site".repeat(40);
    const longLineUserId = "user".repeat(40);

    expect(buildFirebaseUid(longSite, longLineUserId).length).toBeLessThanOrEqual(128);
  });
});
