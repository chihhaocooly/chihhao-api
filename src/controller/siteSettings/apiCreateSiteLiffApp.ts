import { Request, Response } from "express";
import { CreateSiteLiffAppRequest } from "@chihhaocooly/chihhao-package";
import { SiteLineSettingsService } from "../../functions/siteSettings";

const apiCreateSiteLiffApp = async (req: Request, res: Response): Promise<void> => {
  const result = await new SiteLineSettingsService().createLiffApp(
    req.body as Partial<CreateSiteLiffAppRequest>,
    req.authContext?.userId ?? null,
  );

  res.status(201).json(result);
};

export default apiCreateSiteLiffApp;
