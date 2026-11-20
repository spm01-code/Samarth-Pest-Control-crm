import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { requireAdmin } from "../middleware/rbacMiddleware.js";
import {
  getCompanySettings,
  updateCompanySettings,
} from "../controller/companySettingController.js";

const router = express.Router();

router.use(authMiddleware);

// Permitted for Employee and Admin (view settings)
router.get("/", getCompanySettings);

// Admin Only (modify system configuration)
router.put("/", requireAdmin, updateCompanySettings);

export default router;
