import { Request, Response } from 'express';
import { getSurveyReportForAdmin } from '../../functions/survey/surveyService';

const apiGetSurveyReport = async (req: Request, res: Response): Promise<void> => {
  const item = await getSurveyReportForAdmin(req.params.surveyKey, req.params.reportKey);
  res.json({ item });
};

export default apiGetSurveyReport;
