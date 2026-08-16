import { ProjectAssetDto } from './projectAssetTypes';
import { evaluateProjectAssetEligibility, getProjectAssetUsageProfile } from './projectAssetUsageProfiles';

const createAsset = (overrides: Partial<ProjectAssetDto> = {}): ProjectAssetDto => ({
  assetKey: 'asset-1',
  displayName: 'card.png',
  originalFileName: 'card.png',
  fileKind: 'image',
  mimeType: 'image/png',
  fileExtension: '.png',
  sizeBytes: 120 * 1024,
  checksumSha256: '0'.repeat(64),
  storageBucket: 'bucket',
  storageObjectName: 'assets/card.png',
  publicUrl: 'https://example.com/card.png',
  thumbnailUrl: 'https://example.com/card.png',
  width: 1200,
  height: 900,
  durationMs: null,
  ownerModule: 'messageManagement',
  sourceType: 'adminUpload',
  status: 'active',
  tags: [],
  metadata: { usageProfileKey: 'messageManagement.flexCardHero' },
  createdByUserId: null,
  createdAt: null,
  updatedAt: null,
  deletedAt: null,
  variants: [],
  referenceCount: 0,
  ...overrides,
});

describe('projectAssetUsageProfiles', () => {
  it('allows message management Flex images that match the 4:3 profile', () => {
    const profile = getProjectAssetUsageProfile('messageManagement.flexCardHero');

    expect(profile).not.toBeNull();
    expect(evaluateProjectAssetEligibility(createAsset(), profile!.usageProfileKey)).toEqual({
      isEligible: true,
      reasons: [],
    });
  });

  it('rejects assets from a different owner module even when dimensions match', () => {
    const result = evaluateProjectAssetEligibility(
      createAsset({ ownerModule: 'articleManagement' }),
      'messageManagement.flexCardHero'
    );

    expect(result.isEligible).toBe(false);
    expect(result.reasons).toContain('素材歸屬模組不符合目前用途');
  });

  it('rejects Flex images that do not match the profile aspect ratio', () => {
    const result = evaluateProjectAssetEligibility(
      createAsset({ width: 1200, height: 1200 }),
      'messageManagement.flexCardHero'
    );

    expect(result.isEligible).toBe(false);
    expect(result.reasons).toContain('圖片高度不可超過 900px');
    expect(result.reasons).toContain('圖片比例需為 4:3');
  });
});
