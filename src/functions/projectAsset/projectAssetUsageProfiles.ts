import {
  ProjectAssetDto,
  ProjectAssetEligibilityResult,
  ProjectAssetUsageProfileDto,
  ProjectAssetUsageProfileKey,
  projectAssetUsageProfileKeys,
} from './projectAssetTypes';

const oneMb = 1024 * 1024;
const tenMb = 10 * 1024 * 1024;

export const projectAssetUsageProfiles: ProjectAssetUsageProfileDto[] = [
  {
    usageProfileKey: 'messageManagement.image',
    ownerModule: 'messageManagement',
    label: '訊息圖片',
    description: 'LINE image message 使用的 JPEG 或 PNG 圖片。',
    fileKind: 'image',
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    maxSizeBytes: oneMb,
    minWidth: null,
    minHeight: null,
    maxWidth: null,
    maxHeight: null,
    exactWidth: null,
    exactHeight: null,
    aspectRatio: null,
    requiresImagemapVariants: false,
  },
  {
    usageProfileKey: 'messageManagement.flexCardHero',
    ownerModule: 'messageManagement',
    label: 'Flex 圖卡圖片',
    description: '基本圖卡與多卡輪播使用的 4:3 圖片，建議 1200 x 900。',
    fileKind: 'image',
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    maxSizeBytes: oneMb,
    minWidth: null,
    minHeight: null,
    maxWidth: 1200,
    maxHeight: 900,
    exactWidth: null,
    exactHeight: null,
    aspectRatio: '4:3',
    requiresImagemapVariants: false,
  },
  {
    usageProfileKey: 'messageManagement.imageCarousel',
    ownerModule: 'messageManagement',
    label: '圖片輪播圖片',
    description: '圖片輪播卡使用的 1:1 圖片，建議 1024 x 1024。',
    fileKind: 'image',
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    maxSizeBytes: oneMb,
    minWidth: null,
    minHeight: null,
    maxWidth: 1024,
    maxHeight: 1024,
    exactWidth: null,
    exactHeight: null,
    aspectRatio: '1:1',
    requiresImagemapVariants: false,
  },
  {
    usageProfileKey: 'messageManagement.imagemap',
    ownerModule: 'messageManagement',
    label: 'Imagemap 圖片',
    description: 'LINE Imagemap 使用的基準圖，後端會產生 240/300/460/700/1040 variants。',
    fileKind: 'image',
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    maxSizeBytes: tenMb,
    minWidth: null,
    minHeight: null,
    maxWidth: null,
    maxHeight: null,
    exactWidth: null,
    exactHeight: null,
    aspectRatio: null,
    requiresImagemapVariants: true,
  },
  {
    usageProfileKey: 'lineRichMenu.richMenuImage',
    ownerModule: 'lineRichMenu',
    label: 'Line 選單圖片',
    description: '預留給 Line 選單模組使用。',
    fileKind: 'image',
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    maxSizeBytes: oneMb,
    minWidth: null,
    minHeight: null,
    maxWidth: 2500,
    maxHeight: 1686,
    exactWidth: null,
    exactHeight: null,
    aspectRatio: null,
    requiresImagemapVariants: false,
  },
  {
    usageProfileKey: 'articleManagement.coverImage',
    ownerModule: 'articleManagement',
    label: '文章封面圖片',
    description: '預留給文章管理封面圖使用。',
    fileKind: 'image',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeBytes: 3 * oneMb,
    minWidth: null,
    minHeight: null,
    maxWidth: 2400,
    maxHeight: 1600,
    exactWidth: null,
    exactHeight: null,
    aspectRatio: null,
    requiresImagemapVariants: false,
  },
];

export const isProjectAssetUsageProfileKey = (value: unknown): value is ProjectAssetUsageProfileKey => {
  return typeof value === 'string' && projectAssetUsageProfileKeys.includes(value as ProjectAssetUsageProfileKey);
};

export const getProjectAssetUsageProfile = (value: unknown): ProjectAssetUsageProfileDto | null => {
  return isProjectAssetUsageProfileKey(value)
    ? projectAssetUsageProfiles.find((profile) => profile.usageProfileKey === value) ?? null
    : null;
};

export const evaluateProjectAssetEligibility = (
  asset: ProjectAssetDto,
  usageProfileKey: ProjectAssetUsageProfileKey,
): ProjectAssetEligibilityResult => {
  const profile = getProjectAssetUsageProfile(usageProfileKey);
  const reasons: string[] = [];

  if (!profile) {
    return { isEligible: false, reasons: ['素材用途不存在'] };
  }

  if (asset.ownerModule !== profile.ownerModule) {
    reasons.push('素材歸屬模組不符合目前用途');
  }

  if (asset.fileKind !== profile.fileKind) {
    reasons.push('素材類型不符合目前用途');
  }

  if (!profile.allowedMimeTypes.includes(asset.mimeType)) {
    reasons.push('檔案格式不符合目前用途');
  }

  if (asset.sizeBytes > profile.maxSizeBytes) {
    reasons.push('檔案大小超過目前用途限制');
  }

  if (profile.exactWidth !== null && asset.width !== profile.exactWidth) {
    reasons.push(`圖片寬度必須為 ${profile.exactWidth}px`);
  }

  if (profile.exactHeight !== null && asset.height !== profile.exactHeight) {
    reasons.push(`圖片高度必須為 ${profile.exactHeight}px`);
  }

  if (profile.maxWidth !== null && asset.width !== null && asset.width > profile.maxWidth) {
    reasons.push(`圖片寬度不可超過 ${profile.maxWidth}px`);
  }

  if (profile.maxHeight !== null && asset.height !== null && asset.height > profile.maxHeight) {
    reasons.push(`圖片高度不可超過 ${profile.maxHeight}px`);
  }

  if (profile.aspectRatio && !matchesAspectRatio(asset.width, asset.height, profile.aspectRatio)) {
    reasons.push(`圖片比例需為 ${profile.aspectRatio}`);
  }

  if (profile.requiresImagemapVariants && !asset.metadata?.imagemapBaseUrl) {
    reasons.push('素材缺少 Imagemap variants');
  }

  return { isEligible: reasons.length === 0, reasons };
};

const matchesAspectRatio = (width: number | null, height: number | null, ratio: string): boolean => {
  if (!width || !height) {
    return false;
  }

  const [ratioWidth, ratioHeight] = ratio.split(':').map(Number);
  if (!ratioWidth || !ratioHeight) {
    return true;
  }

  return Math.abs((width / height) - (ratioWidth / ratioHeight)) < 0.02;
};
