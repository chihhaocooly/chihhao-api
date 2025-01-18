import { Request, Response } from 'express';
import { setDefaultRichmenu } from '../../functions/richmenu/setDefaultRichmenu';

export default async function apiSetDefaultRichmenu(req: Request, res: Response) {
    const setDefaultRichmenuRequest = req.body as { richmenuKey: string };
    const getAllRichmenuListResponse = await setDefaultRichmenu(setDefaultRichmenuRequest.richmenuKey);
    res.json(getAllRichmenuListResponse);
}