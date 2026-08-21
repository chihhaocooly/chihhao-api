import { Request, Response } from "express";
import { CreateSiteLiffAppRequest } from "@chihhaocooly/chihhao-package";
import { SiteLineSettingsService } from "../../functions/siteSettings";

const apiUpdateSiteLiffApp = async (req: Request, res: Response): Promise<void> => {
  const result = await new SiteLineSettingsService().updateLiffApp(
    req.params.id,
    req.body as Partial<CreateSiteLiffAppRequest>,
  );

  res.json(result);
};

export default apiUpdateSiteLiffApp;
