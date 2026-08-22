import { Request, Response } from 'express';
import { listSurveyCategories } from '../../functions/survey/surveyService';

const apiListSurveyCategories = async (_req: Request, res: Response): Promise<void> => {
  res.json(await listSurveyCategories());
};

export default apiListSurveyCategories;
