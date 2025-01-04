import { Request, Response } from 'express';
import { getAllRichmenuList } from "../../functions/rich-menu/getAllRich-menuList";

export default async function apiGetAllRichmenuList(req: Request, res: Response) {
    const getAllRichmenuListResponse = await getAllRichmenuList();
    res.json(getAllRichmenuListResponse);
}