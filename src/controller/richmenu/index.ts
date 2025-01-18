import express from 'express';
import apiGetAllRichmenuList from './apiGetAllRichmenuList';
import apiSetDefaultRichmenu from './apiSetDefaultRichmenu';


const richmenuRouter = express.Router();

richmenuRouter.get('/allRichmenuList',
    apiGetAllRichmenuList
);

richmenuRouter.post('/setDefaultRichmenu',
    apiSetDefaultRichmenu
);



export default richmenuRouter;