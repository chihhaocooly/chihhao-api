import express from "express";
import { requireRole } from "../../middlewares/requireRole";
import apiCreateSiteLiffApp from "./apiCreateSiteLiffApp";
import apiGetSiteLineSettings from "./apiGetSiteLineSettings";
import apiUpdateSiteLineSettings from "./apiUpdateSiteLineSettings";
import apiVerifyMessageApiToken from "./apiVerifyMessageApiToken";

const siteSettingsRouter = express.Router();

siteSettingsRouter.use(requireRole(["admin"]));
siteSettingsRouter.get("/line", apiGetSiteLineSettings);
siteSettingsRouter.put("/line", apiUpdateSiteLineSettings);
siteSettingsRouter.post("/line/verify", apiVerifyMessageApiToken);
siteSettingsRouter.post("/line/liff-apps", apiCreateSiteLiffApp);

export default siteSettingsRouter;
