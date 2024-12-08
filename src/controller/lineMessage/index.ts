import express from 'express';
import apiGetAllLineMessages from './apiGetAllLineMessages';


const lineMessageRouter = express.Router();

lineMessageRouter.get('/allLineMessages',
    apiGetAllLineMessages
);



export default lineMessageRouter;