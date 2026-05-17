import express from 'express';
import apiGetAllLineMessages from './apiGetAllLineMessages';
import { requireRole } from '../../middlewares/requireRole';


const lineMessageRouter = express.Router();

lineMessageRouter.get('/allLineMessages',
    requireRole(['admin', 'manager', 'viewer']),
    apiGetAllLineMessages
);



export default lineMessageRouter;
