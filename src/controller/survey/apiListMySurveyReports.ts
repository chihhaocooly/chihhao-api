import { Request, Response } from 'express';
import { listMySurveyReports } from '../../functions/survey/surveyService';

const apiListMySurveyReports = async (req: Request, res: Response): Promise<void> => {
  const surveyId = typeof req.query.surveyId === 'string'
    ? req.query.surveyId
    : typeof req.query.id === 'string'
      ? req.query.id
      : '';
  const userId = typeof req.query.userId === 'string' ? req.query.userId : '';

  const result = await listMySurveyReports(surveyId, userId);
  res.json(result);
};

export default apiListMySurveyReports;
