import express from "express";
import {
  getAllServices,
  getService,
  createService,
  updateService,
  deleteService,
  generateServiceDocx,
  generateServicePdf,
  recordServicePayment,
} from "../controller/serviceController.js";
import { requireAdmin, blockEmployeeMutations } from "../middleware/rbacMiddleware.js";

const router = express.Router();

router.use(blockEmployeeMutations);

// Allowed for Employee and Admin
router.get("/", getAllServices);
router.get("/:id", getService);
router.get("/:id/docx", generateServiceDocx);
router.get("/:id/pdf", generateServicePdf);
router.post("/create", createService);
router.post("/:id/payment", recordServicePayment); // Permitted payment recording

// Admin Only
router.put("/:id", requireAdmin, updateService);
router.delete("/:id", requireAdmin, deleteService);

export default router;
