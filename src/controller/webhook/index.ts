import express from 'express';
import { apiLineWebhook } from './apiLineWebhook';


const webhookRouter = express.Router();

webhookRouter.post('/lineWebhook',
    apiLineWebhook
);

export default webhookRouter;