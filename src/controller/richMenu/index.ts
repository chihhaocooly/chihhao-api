import express from 'express';
import apiGetAllRichMenuList from './apiGetAllRichMenuList';


const richMenuRouter = express.Router();

richMenuRouter.get('/allRichMenuList',
    apiGetAllRichMenuList
);



export default richMenuRouter;