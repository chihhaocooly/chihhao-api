import { toProjectAssetDto, toProjectAssetReferenceDto } from './projectAssetMapper';
import { ProjectAssetRow, ProjectAssetReferenceRow } from './projectAssetMapper';

const createAssetRow = (overrides: Partial<ProjectAssetRow> = {}): ProjectAssetRow => ({
  assetKey: 'asset-1',
  displayName: 'survey-image.png',
  originalFileName: 'survey-image.png',
  fileKind: 'image',
  mimeType: 'image/png',
  fileExtension: '.png',
  sizeBytes: 1024,
  checksumSha256: '0'.repeat(64),
  storageBucket: 'bucket',
  storageObjectName: 'assets/survey/image.png',
  publicUrl: 'https://example.com/image.png',
  thumbnailUrl: null,
  width: 1200,
  height: 900,
  durationMs: null,
  ownerModule: 'surveyManagement',
  sourceType: 'adminUpload',
  status: 'active',
  tags: null,
  metadata: { usageProfileKey: 'surveyManagement.descriptionImage' },
  createdByUserId: null,
  createdAt: null,
  updatedAt: null,
  deletedAt: null,
  referenceCount: 0,
  ...overrides,
});

const createReferenceRow = (overrides: Partial<ProjectAssetReferenceRow> = {}): ProjectAssetReferenceRow => ({
  referenceKey: 'reference-1',
  assetKey: 'asset-1',
  ownerModule: 'surveyManagement',
  entityType: 'survey',
  entityKey: 'survey-1',
  entityLabel: '問卷',
  usageProfileKey: 'surveyManagement.descriptionImage',
  usageRole: 'surveyDescriptionImage',
  usagePath: '$.descriptionImageAssetKey',
  isBlockingDelete: true,
  createdAt: null,
  updatedAt: null,
  ...overrides,
});

describe('projectAssetMapper', () => {
  it('keeps survey management as the asset owner module', () => {
    const dto = toProjectAssetDto(createAssetRow());

    expect(dto.ownerModule).toBe('surveyManagement');
  });

  it('keeps survey management as the reference owner module', () => {
    const dto = toProjectAssetReferenceDto(createReferenceRow());

    expect(dto.ownerModule).toBe('surveyManagement');
  });
});
