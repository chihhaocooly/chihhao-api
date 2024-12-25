import { Request, Response } from 'express';
import { getAllRichMenuList } from "../../functions/richMenu/getAllRichMenuList";

export default async function apiGetAllRichMenuList(req: Request, res: Response) {
    const getAllRichMenuListResponse = await getAllRichMenuList();
    res.json(getAllRichMenuListResponse);
}