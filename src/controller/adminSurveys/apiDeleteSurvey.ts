import { Request, Response } from 'express';
import { deleteSurveyForAdmin } from '../../functions/survey/surveyService';

const apiDeleteSurvey = async (req: Request, res: Response): Promise<void> => {
  const deleted = await deleteSurveyForAdmin(req.params.surveyKey);
  if (!deleted) {
    res.status(404).json({ message: '問卷不存在' });
    return;
  }

  res.json({ deleted });
};

export default apiDeleteSurvey;
