import { Request, Response } from 'express';
import { copySurveyForAdmin } from '../../functions/survey/surveyService';

const apiCopySurvey = async (req: Request, res: Response): Promise<void> => {
  const item = await copySurveyForAdmin(req.params.surveyKey);
  if (!item) {
    res.status(404).json({ message: '問卷不存在' });
    return;
  }

  res.status(201).json({ item });
};

export default apiCopySurvey;
