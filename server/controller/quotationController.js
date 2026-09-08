import Quotation from "../model/quotationModel.js";
import CompanySetting from "../model/companySettingModel.js";

import { generateQuotationDocx as generateQuotationDocxFile } from "../utils/docGenerator.js";
import { convertDocxToPdf } from "../utils/docxToPdf.js";
import { generateDocumentNumber } from "../utils/documentNumberService.js";

// ============================================================
// HELPER
// ============================================================

const populateQuotation = (query) => {
  return query.populate("customer").populate("services");
};

// ============================================================
// CREATE QUOTATION
// ============================================================

export const createQuotation = async (req, res) => {
  try {
    const rawType = String(req.body.quotationType || "PC").toUpperCase();
    const quotationType = rawType.includes("ATT") ? "ATT" : "PC";
    const documentType =
      quotationType === "ATT" ? "ATT_QUOTATION" : "PC_QUOTATION";

    // Backend generates atomic sequential quotation number
    const { documentNumber: quotationNumber } = await generateDocumentNumber(
      documentType
    );

    const quotation = await Quotation.create({
      ...req.body,
      quotationType,
      quotationNumber,
    });

    const populatedQuotation = await populateQuotation(
      Quotation.findById(quotation._id),
    );

    return res.status(201).json({
      success: true,
      message: "Quotation created successfully.",
      quotation: populatedQuotation,
    });
  } catch (error) {
    console.error("Create quotation error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ============================================================
// GET ALL QUOTATIONS
// ============================================================

export const getQuotations = async (req, res) => {
  try {
    const quotations = await populateQuotation(
      Quotation.find().sort({ createdAt: -1 }),
    );

    return res.status(200).json({
      success: true,
      quotations,
    });
  } catch (error) {
    console.error("Get quotations error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ============================================================
// GET SINGLE QUOTATION
// ============================================================

export const getQuotation = async (req, res) => {
  try {
    const quotation = await populateQuotation(
      Quotation.findById(req.params.id),
    );

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: "Quotation not found.",
      });
    }

    return res.status(200).json({
      success: true,
      quotation,
    });
  } catch (error) {
    console.error("Get quotation error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ============================================================
// GET CUSTOMER QUOTATIONS
// ============================================================

export const getCustomerQuotations = async (req, res) => {
  try {
    const quotations = await populateQuotation(
      Quotation.find({
        customer: req.params.customerId,
      }).sort({ createdAt: -1 }),
    );

    return res.status(200).json({
      success: true,
      quotations,
    });
  } catch (error) {
    console.error("Get customer quotations error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ============================================================
// UPDATE QUOTATION
// ============================================================

export const updateQuotation = async (req, res) => {
  try {
    const updatedQuotation = await Quotation.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      },
    );

    if (!updatedQuotation) {
      return res.status(404).json({
        success: false,
        message: "Quotation not found.",
      });
    }

    const quotation = await populateQuotation(
      Quotation.findById(updatedQuotation._id),
    );

    return res.status(200).json({
      success: true,
      message: "Quotation updated successfully.",
      quotation,
    });
  } catch (error) {
    console.error("Update quotation error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ============================================================
// DELETE QUOTATION
// ============================================================

export const deleteQuotation = async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id);

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: "Quotation not found.",
      });
    }

    await quotation.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Quotation deleted successfully.",
    });
  } catch (error) {
    console.error("Delete quotation error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ============================================================
// GENERATE QUOTATION DOCX
// ============================================================

export const generateQuotationDocx = async (req, res) => {
  try {
    // --------------------------------------------------------
    // Find quotation
    // --------------------------------------------------------

    const quotation = await populateQuotation(
      Quotation.findById(req.params.id),
    );

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: "Quotation not found.",
      });
    }

    // --------------------------------------------------------
    // Generate DOCX using shared generator
    // --------------------------------------------------------

    const result = await generateQuotationDocxFile(quotation);

    // --------------------------------------------------------
    // File name
    // --------------------------------------------------------

    const quotationNumber =
      quotation.quotationNumber ||
      quotation.quoteNumber ||
      quotation.number ||
      `quotation-${quotation._id}`;

    const fileName = `${quotationNumber}.docx`;

    // --------------------------------------------------------
    // Response headers
    // --------------------------------------------------------

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );

    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    res.setHeader("Content-Length", result.buffer.length);

    // --------------------------------------------------------
    // Send DOCX
    // --------------------------------------------------------

    return res.send(result.buffer);
  } catch (error) {
    console.error("Generate quotation DOCX error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const generateQuotationPdf = async (req, res) => {
  try {
    const quotation = await populateQuotation(
      Quotation.findById(req.params.id),
    );

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: "Quotation not found.",
      });
    }

    const docxResult = await generateQuotationDocxFile(quotation);
    const pdfBuffer = await convertDocxToPdf(docxResult.buffer);

    const quotationNumber =
      quotation.quotationNumber ||
      quotation.quoteNumber ||
      quotation.number ||
      `quotation-${quotation._id}`;

    const fileName = `${quotationNumber}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.setHeader("Content-Length", pdfBuffer.length);

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Generate quotation PDF error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
