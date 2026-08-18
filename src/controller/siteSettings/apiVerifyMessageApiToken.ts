import { Request, Response } from "express";
import { SiteLineSettingsService } from "../../functions/siteSettings";

const apiVerifyMessageApiToken = async (_req: Request, res: Response): Promise<void> => {
  res.json(await new SiteLineSettingsService().verifyMessageApiToken());
};

export default apiVerifyMessageApiToken;
