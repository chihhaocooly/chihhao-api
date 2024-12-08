import { Request, Response } from 'express';
import { getAllLineMessages } from '../../functions/lineMessage/getAllLineMessages';


export default async function apiGetAllLineMessages(req: Request, res: Response) {

    const getAllLineMessagesResponse = await getAllLineMessages();

    res.json(getAllLineMessagesResponse);
}
