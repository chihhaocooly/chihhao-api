import { Request, Response } from "express";
import { SiteLineSettingsService } from "../../functions/siteSettings";

interface DeleteSiteLiffAppBody {
  confirmLiffId?: string;
}

const apiDeleteSiteLiffApp = async (req: Request, res: Response): Promise<void> => {
  const body = req.body as DeleteSiteLiffAppBody;
  const result = await new SiteLineSettingsService().deleteLiffApp(req.params.id, body.confirmLiffId);

  res.json(result);
};

export default apiDeleteSiteLiffApp;
