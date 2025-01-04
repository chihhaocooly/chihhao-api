import express from 'express';
import apiGetAllRichmenuList from './apiGetAllRich-menuList';


const richmenuRouter = express.Router();

richmenuRouter.get('/allRichmenuList',
    apiGetAllRichmenuList
);



export default richmenuRouter;