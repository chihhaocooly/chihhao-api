import express from "express";
import { requireRole } from "../../middlewares/requireRole";
import apiCreateSiteLiffApp from "./apiCreateSiteLiffApp";
import apiDeleteSiteLiffApp from "./apiDeleteSiteLiffApp";
import apiGetSiteLineSettings from "./apiGetSiteLineSettings";
import apiUpdateSiteLiffApp from "./apiUpdateSiteLiffApp";
import apiUpdateSiteLineSettings from "./apiUpdateSiteLineSettings";
import apiVerifyMessageApiToken from "./apiVerifyMessageApiToken";

const siteSettingsRouter = express.Router();

siteSettingsRouter.use(requireRole(["admin"]));
siteSettingsRouter.get("/line", apiGetSiteLineSettings);
siteSettingsRouter.put("/line", apiUpdateSiteLineSettings);
siteSettingsRouter.post("/line/verify", apiVerifyMessageApiToken);
siteSettingsRouter.post("/line/liff-apps", apiCreateSiteLiffApp);
siteSettingsRouter.put("/line/liff-apps/:id", apiUpdateSiteLiffApp);
siteSettingsRouter.delete("/line/liff-apps/:id", apiDeleteSiteLiffApp);

export default siteSettingsRouter;
