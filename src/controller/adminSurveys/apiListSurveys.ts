import { Request, Response } from 'express';
import { listSurveys } from '../../functions/survey/surveyService';

const apiListSurveys = async (req: Request, res: Response): Promise<void> => {
  const result = await listSurveys({
    q: typeof req.query.q === 'string' ? req.query.q : undefined,
    site: typeof req.query.site === 'string' ? req.query.site : undefined,
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
    page: Number(req.query.page),
    pageSize: Number(req.query.pageSize),
  });

  res.json(result);
};

export default apiListSurveys;
