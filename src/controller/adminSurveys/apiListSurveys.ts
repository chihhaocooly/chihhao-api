import { Request, Response } from 'express';
import { listSurveys } from '../../functions/survey/surveyService';

const apiListSurveys = async (req: Request, res: Response): Promise<void> => {
  const result = await listSurveys({
    q: typeof req.query.q === 'string' ? req.query.q : undefined,
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
    primaryCategoryKey: typeof req.query.primaryCategoryKey === 'string' ? req.query.primaryCategoryKey : undefined,
    secondaryCategoryKey: typeof req.query.secondaryCategoryKey === 'string' ? req.query.secondaryCategoryKey : undefined,
    page: Number(req.query.page),
    pageSize: Number(req.query.pageSize),
  });

  res.json(result);
};

export default apiListSurveys;
