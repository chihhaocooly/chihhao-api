import express from 'express';
import apiGetAllRichmenuList from './apiGetAllRichmenuList';


const richmenuRouter = express.Router();

richmenuRouter.get('/allRichmenuList',
    apiGetAllRichmenuList
);



export default richmenuRouter;