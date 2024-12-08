import { Request, Response, NextFunction } from 'express';

export const auth = (req: Request, res: Response, next: NextFunction) => {
  // const xApiKey = req.header('x-api-key');
  console.log('headers =>', JSON.stringify(req.headers));
  console.log('body =>', JSON.stringify(req.body));
  // const apiKey = process.env.INTERNAL_API_KEY || 'chihhao';

  // if (xApiKey !== apiKey) {
  //   console.log(401, 'Invalid API Key');
  // }
  next();
};
