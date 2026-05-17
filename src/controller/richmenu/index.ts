import express from 'express';
import apiGetAllRichmenuList from './apiGetAllRichmenuList';
import apiSetDefaultRichmenu from './apiSetDefaultRichmenu';
import { requireRole } from '../../middlewares/requireRole';


const richmenuRouter = express.Router();

richmenuRouter.get('/allRichmenuList',
    requireRole(['admin', 'manager', 'viewer']),
    apiGetAllRichmenuList
);

richmenuRouter.post('/setDefaultRichmenu',
    requireRole(['admin', 'manager']),
    apiSetDefaultRichmenu
);



export default richmenuRouter;
