import { Request, Response } from "express";
import { SiteLineSettingsService } from "../../functions/siteSettings";

const apiGetSiteLineSettings = async (_req: Request, res: Response): Promise<void> => {
  res.json(await new SiteLineSettingsService().getSettings());
};

export default apiGetSiteLineSettings;
