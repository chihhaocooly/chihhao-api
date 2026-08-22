import { Request, Response } from 'express';
import { createSurveyForAdmin } from '../../functions/survey/surveyService';
import { SaveSurveyRequest } from '../../functions/survey/surveyTypes';

const apiCreateSurvey = async (req: Request, res: Response): Promise<void> => {
  const { validation, item } = await createSurveyForAdmin(req.body as SaveSurveyRequest);
  if (!item) {
    res.status(400).json(validation);
    return;
  }

  res.status(201).json({ item });
};

export default apiCreateSurvey;
