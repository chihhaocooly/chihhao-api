import { Request, Response } from 'express';
import { getLineMessageReferences } from '../../functions/lineMessage/lineMessageService';

const apiGetLineMessageReferences = async (req: Request, res: Response): Promise<void> => {
  const references = await getLineMessageReferences(req.params.lineMessageKey);
  res.json({ references, canDelete: references.length === 0 });
};

export default apiGetLineMessageReferences;
