import { Request, Response } from 'express';
import { submitSurvey } from '../../functions/survey/surveyService';
import { SurveySubmitRequest } from '../../functions/survey/surveyTypes';

const apiSubmitSurvey = async (req: Request, res: Response): Promise<void> => {
  const result = await submitSurvey(req.body as SurveySubmitRequest);
  res.status(201).json(result);
};

export default apiSubmitSurvey;
