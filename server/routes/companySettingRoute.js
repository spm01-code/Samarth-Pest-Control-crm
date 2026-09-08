import express from "express";

import authMiddleware from "../middleware/authMiddleware.js";

import {
  getCompanySettings,
  updateCompanySettings,
} from "../controller/companySettingController.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/", getCompanySettings);

router.put("/", updateCompanySettings);

export default router;
