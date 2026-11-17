import fs from "fs";
import path from "path";
import DocumentTemplate from "../model/documentTemplateModel.js";
import { validatePdfTemplateForCategory } from "../utils/pdfTemplateInspector.js";

const templatesDirectory = path.resolve(
  process.cwd(),
  "uploads",
  "templates"
);

if (!fs.existsSync(templatesDirectory)) {
  fs.mkdirSync(templatesDirectory, {
    recursive: true,
  });
}

// ========================================
// UPLOAD TEMPLATE
// ========================================

export const uploadTemplate = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Template file (.docx or .pdf) is required",
      });
    }

    // Validate file magic bytes
    let detectedMimeType = req.file.mimetype;
    try {
      const bufferHeader = Buffer.alloc(5);
      const fd = fs.openSync(req.file.path, "r");
      fs.readSync(fd, bufferHeader, 0, 5, 0);
      fs.closeSync(fd);

      const isPdfHeader = bufferHeader.toString("ascii").startsWith("%PDF-");
      const isDocxHeader =
        bufferHeader[0] === 0x50 &&
        bufferHeader[1] === 0x4b &&
        bufferHeader[2] === 0x03 &&
        bufferHeader[3] === 0x04;

      if (!isPdfHeader && !isDocxHeader) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          success: false,
          message: "Uploaded file is not a valid DOCX or PDF document",
        });
      }

      detectedMimeType = isPdfHeader
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    } catch (readErr) {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        success: false,
        message: "Failed to read and validate uploaded template file",
      });
    }

    const { documentType, templateName } = req.body;

    const allowedTypes = [
      "invoice",
      "tax-invoice",
      "quotation",
      "contract-renewal",
      "att-quotation",
      "one-time-job",
    ];

    if (!allowedTypes.includes(documentType)) {
      fs.unlinkSync(req.file.path);

      return res.status(400).json({
        success: false,
        message: "Invalid document type",
      });
    }

    if (!templateName?.trim()) {
      fs.unlinkSync(req.file.path);

      return res.status(400).json({
        success: false,
        message: "Template name is required",
      });
    }

    // Category-specific validation for PDF templates (rejects scanned/non-text and mismatched-category PDFs)
    if (detectedMimeType === "application/pdf") {
      try {
        const pdfBytes = fs.readFileSync(req.file.path);
        await validatePdfTemplateForCategory(pdfBytes, documentType);
      } catch (validationErr) {
        if (req.file?.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(validationErr.statusCode || 400).json({
          success: false,
          message: validationErr.message,
          ...(validationErr.details ? { details: validationErr.details } : {}),
        });
      }
    }

    // Deactivate existing active template
    await DocumentTemplate.updateMany(
      {
        documentType,
        isActive: true,
      },
      {
        $set: {
          isActive: false,
        },
      }
    );

    const template = await DocumentTemplate.create({
      documentType,
      templateName: templateName.trim(),
      fileName: req.file.originalname,
      filePath: req.file.path,
      mimeType: detectedMimeType,
      isActive: true,
      uploadedBy: req.admin._id,
    });

    return res.status(201).json({
      success: true,
      message: "Template uploaded successfully",
      template,
    });
  } catch (error) {
    console.error("Upload template error:", error);

    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message,
    });
  }
};

// ========================================
// GET ACTIVE TEMPLATE
// ========================================

export const getActiveTemplate = async (req, res) => {
  try {
    const { documentType } = req.params;

    const template = await DocumentTemplate.findOne({
      documentType,
      isActive: true,
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "No active template found",
      });
    }

    return res.status(200).json({
      success: true,
      template,
    });
  } catch (error) {
    console.error("Get template error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ========================================
// GET ALL TEMPLATES
// ========================================

export const getTemplates = async (req, res) => {
  try {
    const templates = await DocumentTemplate.find()
      .populate("uploadedBy", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      templates,
    });
  } catch (error) {
    console.error("Get templates error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ========================================
// REMOVE TEMPLATE
// ========================================

export const deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params;

    // Find template
    const template = await DocumentTemplate.findById(id);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Template not found",
      });
    }

    // Delete physical DOCX file
    if (template.filePath && fs.existsSync(template.filePath)) {
      fs.unlinkSync(template.filePath);
    }

    // Delete template record from MongoDB
    await DocumentTemplate.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Template removed successfully",
    });
  } catch (error) {
    console.error("Delete template error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ========================================
// ACTIVATE TEMPLATE
// ========================================

export const activateTemplate = async (req, res) => {
  try {
    const { id } = req.params;

    // Find template
    const template = await DocumentTemplate.findById(id);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Template not found",
      });
    }

    const isPdf =
      template.mimeType === "application/pdf" ||
      template.filePath?.toLowerCase().endsWith(".pdf") ||
      template.fileName?.toLowerCase().endsWith(".pdf");

    if (isPdf) {
      const baseName = template.filePath ? path.basename(template.filePath) : "";
      const candidatePaths = [
        template.filePath,
        baseName ? path.join(templatesDirectory, baseName) : null,
        baseName ? path.resolve(process.cwd(), "server", "uploads", "templates", baseName) : null,
      ].filter(Boolean);
      const resolvedPath = candidatePaths.find((p) => fs.existsSync(p)) || null;
      if (!resolvedPath) {
        return res.status(404).json({
          success: false,
          message: "Template PDF file not found on disk",
        });
      }
      try {
        await validatePdfTemplateForCategory(
          fs.readFileSync(resolvedPath),
          template.documentType
        );
      } catch (validationErr) {
        return res.status(validationErr.statusCode || 400).json({
          success: false,
          message: validationErr.message,
        });
      }
    }

    // Deactivate existing active templates of the same documentType
    await DocumentTemplate.updateMany(
      {
        documentType: template.documentType,
        isActive: true,
      },
      {
        $set: {
          isActive: false,
        },
      }
    );

    // Activate this template
    template.isActive = true;
    await template.save();

    return res.status(200).json({
      success: true,
      message: "Template activated successfully",
      template,
    });
  } catch (error) {
    console.error("Activate template error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};