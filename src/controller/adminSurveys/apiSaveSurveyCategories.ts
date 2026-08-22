import { Request, Response } from 'express';
import { saveSurveyCategories } from '../../functions/survey/surveyService';
import { SaveSurveyCategoriesRequest } from '../../functions/survey/surveyTypes';

const apiSaveSurveyCategories = async (req: Request, res: Response): Promise<void> => {
  const result = await saveSurveyCategories(req.body as SaveSurveyCategoriesRequest);
  if (!result.validation.isValid) {
    res.status(400).json(result.validation);
    return;
  }

  res.json({ categories: result.categories });
};

export default apiSaveSurveyCategories;
