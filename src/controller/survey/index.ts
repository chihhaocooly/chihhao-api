import express from 'express';
import apiGetMySurveyReport from './apiGetMySurveyReport';
import apiGetSurveyRuntime from './apiGetSurveyRuntime';
import apiListMySurveyReports from './apiListMySurveyReports';
import apiSubmitSurvey from './apiSubmitSurvey';

const surveyRouter = express.Router();

surveyRouter.get('/runtime', apiGetSurveyRuntime);
surveyRouter.post('/submit', apiSubmitSurvey);
surveyRouter.get('/my-reports', apiListMySurveyReports);
surveyRouter.get('/my-reports/:reportKey', apiGetMySurveyReport);

export default surveyRouter;
