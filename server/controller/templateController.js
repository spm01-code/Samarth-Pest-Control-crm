import fs from "fs";
import path from "path";
import DocumentTemplate from "../model/documentTemplateModel.js";

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
        message: "DOCX template file is required",
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
      mimeType: req.file.mimetype,
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

    return res.status(500).json({
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