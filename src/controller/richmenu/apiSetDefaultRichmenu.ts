import { Request, Response } from 'express';
import { setDefaultRichmenuByKey } from '../../functions/richmenu/richmenuService';

export default async function apiSetDefaultRichmenu(req: Request, res: Response) {
    const setDefaultRichmenuRequest = req.body as { richmenuKey: string };
    const item = await setDefaultRichmenuByKey(setDefaultRichmenuRequest.richmenuKey);
    res.json({ item });
}
