import { Request, Response } from "express";
import { LineAuthService } from "../../functions/lineAuth/lineAuthService";

const apiLineAuthLogin = async (req: Request, res: Response): Promise<void> => {
  const idToken = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice("Bearer ".length)
    : "";
  const site = typeof req.body?.site === "string" ? req.body.site : "";
  const result = await new LineAuthService().loginWithLineIdToken({ site, idToken });

  res.json(result);
};

export default apiLineAuthLogin;
