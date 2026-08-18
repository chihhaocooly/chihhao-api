import { Request, Response } from "express";
import { UpdateSiteLineSettingsRequest } from "@chihhaocooly/chihhao-package";
import { SiteLineSettingsService } from "../../functions/siteSettings";

const apiUpdateSiteLineSettings = async (req: Request, res: Response): Promise<void> => {
  const result = await new SiteLineSettingsService().updateSettings(
    req.body as Partial<UpdateSiteLineSettingsRequest>,
    req.authContext?.userId ?? null,
  );

  res.json(result);
};

export default apiUpdateSiteLineSettings;
