import { Request, Response } from 'express';
import { listSurveyReportsForAdmin } from '../../functions/survey/surveyService';

const apiListSurveyReports = async (req: Request, res: Response): Promise<void> => {
  const items = await listSurveyReportsForAdmin(req.params.surveyKey);
  res.json({ items });
};

export default apiListSurveyReports;
