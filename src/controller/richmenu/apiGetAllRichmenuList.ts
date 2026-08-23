import { Request, Response } from 'express';
import { listRichmenus } from '../../functions/richmenu/richmenuService';

export default async function apiGetAllRichmenuList(req: Request, res: Response) {
    const result = await listRichmenus('published');
    res.json({ richmenuDtoList: result.items });
}
