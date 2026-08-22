import { Request, Response } from 'express';
import { updateSurveyForAdmin } from '../../functions/survey/surveyService';
import { SaveSurveyRequest } from '../../functions/survey/surveyTypes';

const apiUpdateSurvey = async (req: Request, res: Response): Promise<void> => {
  const { validation, item } = await updateSurveyForAdmin(req.params.surveyKey, req.body as SaveSurveyRequest);
  if (!validation && !item) {
    res.status(404).json({ message: '問卷不存在' });
    return;
  }

  if (!item) {
    res.status(400).json(validation);
    return;
  }

  res.json({ item });
};

export default apiUpdateSurvey;
