import axios, { AxiosError } from "axios";
import { SiteLineSettingRepository } from "@chihhaocooly/chihhao-package";
import { MyError } from "../../@types/my-error";
import { getFirebaseAuth } from "../../firebase/getFirebaseAuth";

const LINE_ID_TOKEN_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";
const FIREBASE_UID_MAX_LENGTH = 128;

interface LineAuthLoginRequest {
  site: string;
  idToken: string;
}

interface LineAuthLoginResponse {
  status: "success";
  token: string;
}

interface LineIdTokenProfile {
  sub?: string;
  name?: string;
  picture?: string;
  email?: string;
}

interface LineIdTokenVerifier {
  verifyIdToken(idToken: string, channelId: string): Promise<LineIdTokenProfile>;
}

interface FirebaseCustomTokenIssuer {
  createCustomToken(uid: string, developerClaims?: Record<string, unknown>): Promise<string>;
}

export class AxiosLineIdTokenVerifier implements LineIdTokenVerifier {
  async verifyIdToken(idToken: string, channelId: string): Promise<LineIdTokenProfile> {
    const body = new URLSearchParams({
      id_token: idToken,
      client_id: channelId,
    });

    try {
      const response = await axios.post<LineIdTokenProfile>(LINE_ID_TOKEN_VERIFY_URL, body.toString(), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      return response.data;
    } catch (error) {
      throw toLineVerifyError(error);
    }
  }
}

export class LineAuthService {
  constructor(
    private readonly verifier: LineIdTokenVerifier = new AxiosLineIdTokenVerifier(),
    private readonly firebaseAuth: FirebaseCustomTokenIssuer = getFirebaseAuth(),
  ) {}

  async loginWithLineIdToken(payload: Partial<LineAuthLoginRequest>): Promise<LineAuthLoginResponse> {
    const site = normalizeRequiredText(payload.site, "site 為必填");
    const idToken = normalizeRequiredText(payload.idToken, "LINE ID token 為必填");
    const channelId = await getLineLoginChannelId();
    const profile = await this.verifier.verifyIdToken(idToken, channelId);
    const lineUserId = profile.sub?.trim();

    if (!lineUserId) {
      throw new MyError(401, "LINE ID token 驗證失敗");
    }

    const token = await this.firebaseAuth.createCustomToken(buildFirebaseUid(site, lineUserId), {
      provider: "line",
      site,
      lineUserId,
    });

    return {
      status: "success",
      token,
    };
  }
}

export const buildFirebaseUid = (site: string, lineUserId: string): string => {
  const normalizedSite = site.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
  const uid = `line:${normalizedSite}:${lineUserId}`;

  if (uid.length <= FIREBASE_UID_MAX_LENGTH) {
    return uid;
  }

  return `line:${lineUserId}`.slice(0, FIREBASE_UID_MAX_LENGTH);
};

const getLineLoginChannelId = async (): Promise<string> => {
  const setting = await new SiteLineSettingRepository().findCurrent();
  const channelId = setting?.lineLoginChannelId?.trim() || process.env.LINE_LOGIN_CHANNEL_ID?.trim();

  if (!channelId) {
    throw new MyError(400, "LINE Login channel 尚未設定");
  }

  return channelId;
};

const normalizeRequiredText = (value: string | undefined, message: string): string => {
  const normalized = value?.trim();
  if (!normalized) {
    throw new MyError(400, message);
  }

  return normalized;
};

const toLineVerifyError = (error: unknown): MyError => {
  if (isAxiosError(error)) {
    const status = error.response?.status;

    console.error("LINE ID token verify error", {
      status,
      response: error.response?.data,
    });

    if (status === 400 || status === 401) {
      return new MyError(401, "LINE ID token 驗證失敗");
    }
  }

  return new MyError(502, "LINE ID token 驗證服務暫時無法使用");
};

const isAxiosError = (error: unknown): error is AxiosError => {
  return typeof error === "object" && error !== null && (error as AxiosError).isAxiosError === true;
};
