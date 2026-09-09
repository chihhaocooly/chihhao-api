import type { ProjectAssetReference } from '@chihhaocooly/chihhao-package';
import { replaceProjectAssetReferencesForEntity } from './projectAssetService';
import type { ProjectAssetReferenceInput } from './projectAssetTypes';

const mockReplaceForEntity = jest.fn();
jest.mock('@chihhaocooly/chihhao-package', () => ({
  AppDataSource: { query: jest.fn() },
  ProjectAssetReferenceRepository: jest.fn().mockImplementation(() => ({
    replaceForEntity: (...args: unknown[]) => mockReplaceForEntity(...args),
  })),
}));

const reference: ProjectAssetReferenceInput = {
  assetKey: 'asset-key', ownerModule: 'surveyManagement', entityType: 'survey', entityKey: 'survey-key',
  entityLabel: '會員問卷', usageProfileKey: 'surveyManagement.descriptionImage',
  usageRole: 'surveyDescriptionImage', usagePath: 'descriptionImageAssetKey',
};

describe('replaceProjectAssetReferencesForEntity completion contract', () => {
  beforeEach(() => mockReplaceForEntity.mockReset());

  it('等待儲存完成，維持 Promise<void> 而不回傳 package entities', async () => {
    let resolve!: (value: ProjectAssetReference[]) => void;
    mockReplaceForEntity.mockReturnValue(new Promise<ProjectAssetReference[]>(done => { resolve = done; }));
    const pending: Promise<void> = replaceProjectAssetReferencesForEntity('survey', 'survey-key', [reference]);
    let settled = false;
    void pending.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    resolve([{ ...reference, referenceKey: 'reference-key', isBlockingDelete: true }]);
    await expect(pending).resolves.toBeUndefined();
    expect(mockReplaceForEntity).toHaveBeenCalledWith('survey', 'survey-key', [reference]);
  });

  it('將儲存失敗傳遞給 caller，保留同一錯誤', async () => {
    const failure = new Error('reference save failed');
    mockReplaceForEntity.mockRejectedValue(failure);
    await expect(replaceProjectAssetReferencesForEntity('survey', 'survey-key', [reference])).rejects.toBe(failure);
  });
});
