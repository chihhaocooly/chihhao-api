import { Request, Response } from 'express';
import { getSurveyForAdmin } from '../../functions/survey/surveyService';

const apiGetSurvey = async (req: Request, res: Response): Promise<void> => {
  const item = await getSurveyForAdmin(req.params.surveyKey);
  if (!item) {
    res.status(404).json({ message: '問卷不存在' });
    return;
  }

  res.json({ item });
};

export default apiGetSurvey;
