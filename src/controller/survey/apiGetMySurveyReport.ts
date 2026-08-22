import { Request, Response } from 'express';
import { getMySurveyReport } from '../../functions/survey/surveyService';

const apiGetMySurveyReport = async (req: Request, res: Response): Promise<void> => {
  const site = typeof req.query.site === 'string' ? req.query.site : '';
  const surveyId = typeof req.query.surveyId === 'string'
    ? req.query.surveyId
    : typeof req.query.id === 'string'
      ? req.query.id
      : '';
  const userId = typeof req.query.userId === 'string' ? req.query.userId : '';

  const result = await getMySurveyReport(site, surveyId, userId, req.params.reportKey);
  res.json(result);
};

export default apiGetMySurveyReport;
