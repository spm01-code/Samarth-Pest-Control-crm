import express from "express";

import {
  getAllServices,
  getService,
  createService,
  updateService,
  deleteService,
  generateServiceDocx,
  generateServicePdf,
} from "../controller/serviceController.js";

const router = express.Router();

router.get("/", getAllServices);
router.get("/:id", getService);
router.get("/:id/docx", generateServiceDocx);
router.get("/:id/pdf", generateServicePdf);
router.post("/create", createService);
router.put("/:id", updateService);
router.delete("/:id", deleteService);

export default router;
