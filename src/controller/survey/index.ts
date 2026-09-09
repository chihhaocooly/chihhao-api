import express from 'express';
import { lineMemberAuth } from '../../middlewares/lineMemberAuth';
import { MemberConfigurationRepository } from '@chihhaocooly/chihhao-package';
import { taiwanRegions } from '../../functions/membership/memberRegions';
import apiGetMySurveyReport from './apiGetMySurveyReport';
import apiGetSurveyRuntime from './apiGetSurveyRuntime';
import apiListMySurveyReports from './apiListMySurveyReports';
import apiSubmitSurvey from './apiSubmitSurvey';

const surveyRouter = express.Router();

surveyRouter.use(lineMemberAuth);
surveyRouter.get('/member-default', async (_req, res) => {
  const repo = new MemberConfigurationRepository();
  const key = (await repo.getSettings())?.defaultSurveyKey;
  const form = key ? await repo.findForm(key) : null;
  res.json({ surveyKey: form ? key : null });
});
surveyRouter.get('/member-regions', (_req, res) => {
  res.json(taiwanRegions);
});
surveyRouter.get('/runtime', apiGetSurveyRuntime);
surveyRouter.post('/submit', apiSubmitSurvey);
surveyRouter.get('/my-reports', apiListMySurveyReports);
surveyRouter.get('/my-reports/:reportKey', apiGetMySurveyReport);

export default surveyRouter;
