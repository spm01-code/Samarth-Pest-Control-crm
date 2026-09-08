import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  uploadFile,
  selectSheet,
  validateSession,
  commitSession,
  getHelpers,
} from "../controller/importController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// Ensure upload directory exists
const uploadDir = path.join(process.cwd(), "uploads", "imports");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === ".xlsx" || ext === ".xls" || ext === ".csv") {
      cb(null, true);
    } else {
      cb(new Error("Only .xlsx, .xls, and .csv files are supported."));
    }
  },
});

router.post("/upload", authMiddleware, upload.single("file"), uploadFile);
router.post("/select-sheet", authMiddleware, selectSheet);
router.get("/helpers", authMiddleware, getHelpers);
router.post("/validate", authMiddleware, validateSession);
router.post("/commit", authMiddleware, commitSession);

export default router;
