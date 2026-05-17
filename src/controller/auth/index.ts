import express from 'express';
import apiGetMe from './apiGetMe';

const authRouter = express.Router();

authRouter.get('/me', apiGetMe);

export default authRouter;
