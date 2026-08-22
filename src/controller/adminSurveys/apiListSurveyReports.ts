import { Request, Response } from 'express';
import { listSurveyReportsForAdmin } from '../../functions/survey/surveyService';

const apiListSurveyReports = async (req: Request, res: Response): Promise<void> => {
  const result = await listSurveyReportsForAdmin(req.params.surveyKey, {
    q: typeof req.query.q === 'string' ? req.query.q : undefined,
    page: Number(req.query.page),
    pageSize: Number(req.query.pageSize),
  });
  res.json(result);
};

export default apiListSurveyReports;
