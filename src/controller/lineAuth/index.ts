import express from "express";
import apiLineAuthLogin from "./apiLineAuthLogin";

const lineAuthRouter = express.Router();

lineAuthRouter.post("/", apiLineAuthLogin);

export default lineAuthRouter;
