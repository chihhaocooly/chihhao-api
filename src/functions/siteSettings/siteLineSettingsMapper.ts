import {
  SiteLiffApp,
  SiteLiffAppDto,
  SiteLineSetting,
  SiteLineSettingsDto,
} from "@chihhaocooly/chihhao-package";

const toIsoString = (value: Date | null | undefined): string | null => value?.toISOString() ?? null;

export const toSiteLineSettingsDto = (setting: SiteLineSetting | null): SiteLineSettingsDto => ({
  lineLoginChannelId: setting?.lineLoginChannelId ?? null,
  hasLineLoginChannelSecret: !!setting?.lineLoginChannelSecretSecretName,
  lineLoginChannelSecretMask: setting?.lineLoginChannelSecretMask ?? null,
  hasMessageApiChannelAccessToken: !!setting?.messageApiChannelAccessTokenSecretName,
  messageApiChannelAccessTokenMask: setting?.messageApiChannelAccessTokenMask ?? null,
  botBasicId: setting?.botBasicId ?? null,
  updatedByUserId: setting?.updatedByUserId ?? null,
  createdAt: toIsoString(setting?.createdAt),
  updatedAt: toIsoString(setting?.updatedAt),
});

export const toSiteLiffAppDto = (app: SiteLiffApp): SiteLiffAppDto => ({
  id: app.id,
  liffId: app.liffId,
  description: app.description,
  endpointUrl: app.endpointUrl,
  viewType: app.viewType,
  scope: app.scope,
  botPrompt: app.botPrompt,
  moduleMode: app.moduleMode,
  qrCode: app.qrCode,
  createdByUserId: app.createdByUserId ?? null,
  createdAt: toIsoString(app.createdAt),
  updatedAt: toIsoString(app.updatedAt),
});
