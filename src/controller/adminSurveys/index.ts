import express from 'express';
import { requireRole } from '../../middlewares/requireRole';
import apiCopySurvey from './apiCopySurvey';
import apiCreateSurvey from './apiCreateSurvey';
import apiDeleteSurvey from './apiDeleteSurvey';
import apiGetSurvey from './apiGetSurvey';
import apiListSurveyCategories from './apiListSurveyCategories';
import apiListSurveyReports from './apiListSurveyReports';
import apiListSurveys from './apiListSurveys';
import apiSaveSurveyCategories from './apiSaveSurveyCategories';
import apiUpdateSurvey from './apiUpdateSurvey';

const adminSurveysRouter = express.Router();

adminSurveysRouter.get(
  '/',
  requireRole(['admin', 'manager', 'viewer']),
  apiListSurveys,
);

adminSurveysRouter.post(
  '/',
  requireRole(['admin', 'manager']),
  apiCreateSurvey,
);

adminSurveysRouter.get(
  '/settings/categories',
  requireRole(['admin', 'manager', 'viewer']),
  apiListSurveyCategories,
);

adminSurveysRouter.put(
  '/settings/categories',
  requireRole(['admin', 'manager']),
  apiSaveSurveyCategories,
);

adminSurveysRouter.get(
  '/:surveyKey/reports',
  requireRole(['admin', 'manager', 'viewer']),
  apiListSurveyReports,
);

adminSurveysRouter.post(
  '/:surveyKey/copy',
  requireRole(['admin', 'manager']),
  apiCopySurvey,
);

adminSurveysRouter.get(
  '/:surveyKey',
  requireRole(['admin', 'manager', 'viewer']),
  apiGetSurvey,
);

adminSurveysRouter.put(
  '/:surveyKey',
  requireRole(['admin', 'manager']),
  apiUpdateSurvey,
);

adminSurveysRouter.delete(
  '/:surveyKey',
  requireRole(['admin', 'manager']),
  apiDeleteSurvey,
);

export default adminSurveysRouter;
