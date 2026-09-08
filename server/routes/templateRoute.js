import express from "express";

import authMiddleware from "../middleware/authMiddleware.js";
import templateUpload from "../middleware/templateUpload.js";

import {
  uploadTemplate,
  getActiveTemplate,
  getTemplates, 
  deleteTemplate,
  activateTemplate
} from "../controller/templateController.js";

const router = express.Router();

router.use(authMiddleware);

router.post("/upload", templateUpload.single("template"), uploadTemplate);

router.get("/", getTemplates);

router.get("/active/:documentType", getActiveTemplate);

router.put("/:id/activate", activateTemplate);

router.delete("/:id", deleteTemplate);

export default router;

