import express from "express";
import {
  getJobNumberStats,
  getAllJobNumbers,
  getNextAvailable,
  validateManualJobNo,
  syncJobNumberRegistryEndpoint,
} from "../controller/jobNumberController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { requireAdmin } from "../middleware/rbacMiddleware.js";

const router = express.Router();

router.use(authMiddleware);

// Permitted for Employee and Admin
router.get("/", getAllJobNumbers);
router.get("/list", getAllJobNumbers);
router.get("/stats", getJobNumberStats);
router.get("/next-available", getNextAvailable);
router.post("/validate-manual", validateManualJobNo);

// Admin Only: Sync sequence registry
router.post("/sync", requireAdmin, syncJobNumberRegistryEndpoint);

export default router;
