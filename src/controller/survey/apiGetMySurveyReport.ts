import { Request, Response } from 'express';
import { getMySurveyReport } from '../../functions/survey/surveyService';

const apiGetMySurveyReport = async (req: Request, res: Response): Promise<void> => {
  const surveyId = typeof req.query.surveyId === 'string'
    ? req.query.surveyId
    : typeof req.query.id === 'string'
      ? req.query.id
      : '';
  const userId = req.lineMemberId!;

  const result = await getMySurveyReport(surveyId, userId, req.params.reportKey);
  res.json(result);
};

export default apiGetMySurveyReport;
