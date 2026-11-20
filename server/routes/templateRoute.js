import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import templateUpload from "../middleware/templateUpload.js";
import { requireAdmin } from "../middleware/rbacMiddleware.js";
import {
  uploadTemplate,
  getActiveTemplate,
  getTemplates,
  deleteTemplate,
  activateTemplate,
} from "../controller/templateController.js";

const router = express.Router();

router.use(authMiddleware);

// Permitted for Employee and Admin
router.get("/", getTemplates);
router.get("/active/:documentType", getActiveTemplate);

// Admin Only
router.post("/upload", requireAdmin, templateUpload.single("template"), uploadTemplate);
router.put("/:id/activate", requireAdmin, activateTemplate);
router.delete("/:id", requireAdmin, deleteTemplate);

export default router;
