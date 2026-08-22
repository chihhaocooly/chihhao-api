import { Request, Response } from 'express';
import { getSurveyRuntime } from '../../functions/survey/surveyService';

const apiGetSurveyRuntime = async (req: Request, res: Response): Promise<void> => {
  const site = typeof req.query.site === 'string' ? req.query.site : '';
  const surveyId = typeof req.query.surveyId === 'string'
    ? req.query.surveyId
    : typeof req.query.id === 'string'
      ? req.query.id
      : '';
  const userId = typeof req.query.userId === 'string' ? req.query.userId : '';

  const result = await getSurveyRuntime(site, surveyId, userId);
  res.json(result);
};

export default apiGetSurveyRuntime;
