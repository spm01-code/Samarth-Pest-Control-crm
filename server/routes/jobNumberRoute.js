import express from "express";
import {
  getJobNumberStats,
  getAllJobNumbers,
  getNextAvailable,
  validateManualJobNo,
  syncJobNumberRegistryEndpoint,
} from "../controller/jobNumberController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/", getAllJobNumbers);
router.get("/list", getAllJobNumbers);
router.get("/stats", getJobNumberStats);
router.get("/next-available", getNextAvailable);
router.post("/validate-manual", validateManualJobNo);
router.post("/sync", syncJobNumberRegistryEndpoint);

export default router;
