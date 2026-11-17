import mongoose from "mongoose";
import Quotation from "../model/quotationModel.js";
import Customer from "../model/customerModel.js";
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

    let totalAmount = req.body.totalAmount;
    if (
      (totalAmount === undefined || totalAmount === null || totalAmount === "") &&
      Array.isArray(req.body.services)
    ) {
      totalAmount = req.body.services.reduce(
        (sum, s) => sum + (Number(s.cost ?? s.amount) || 0),
        0
      );
    }

    let customerSnapshot = undefined;
    const bodyCopy = { ...req.body };

    if (bodyCopy.customer && mongoose.Types.ObjectId.isValid(bodyCopy.customer)) {
      const cust = await Customer.findById(bodyCopy.customer).lean();
      if (cust) {
        bodyCopy.customer = cust._id;
        customerSnapshot = {
          jobNo: cust.jobNo || cust.archivedJobNo || "",
          fullName: cust.fullName || "",
          companyName: cust.companyName || "",
          customerName: cust.fullName || cust.companyName || "",
          address: cust.address || bodyCopy.premises || "",
          phone: cust.phone || "",
          email: cust.email || "",
          gstNumber: cust.gstNumber || "",
          contactPerson: cust.contactPerson || "",
          snapshotTakenAt: new Date(),
        };
      } else {
        delete bodyCopy.customer;
      }
    } else {
      delete bodyCopy.customer;
    }

    // If no existing customer reference, construct manual customer snapshot
    if (!customerSnapshot) {
      const snapInput = bodyCopy.customerSnapshot || {};
      const custName = (
        snapInput.fullName ||
        snapInput.customerName ||
        snapInput.companyName ||
        bodyCopy.customerName ||
        bodyCopy.fullName ||
        bodyCopy.companyName ||
        ""
      ).trim();

      if (!custName) {
        return res.status(400).json({
          success: false,
          message: "Customer name is required for quotation.",
        });
      }

      customerSnapshot = {
        jobNo: snapInput.jobNo || "",
        fullName: custName,
        customerName: custName,
        companyName: snapInput.companyName || bodyCopy.companyName || "",
        address: snapInput.address || bodyCopy.address || bodyCopy.premises || "",
        phone: snapInput.phone || bodyCopy.phone || "",
        email: snapInput.email || bodyCopy.email || "",
        gstNumber: snapInput.gstNumber || bodyCopy.gstNumber || "",
        contactPerson: snapInput.contactPerson || bodyCopy.contactPerson || "",
        snapshotTakenAt: new Date(),
      };
    }

    const quotation = await Quotation.create({
      ...bodyCopy,
      ...(totalAmount !== undefined && totalAmount !== null ? { totalAmount } : {}),
      customerSnapshot,
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

    return res.status(error.statusCode || 500).json({
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

    return res.status(error.statusCode || 500).json({
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

    return res.status(error.statusCode || 500).json({
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

    return res.status(error.statusCode || 500).json({
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
    const updateData = { ...req.body };
    if (
      (updateData.totalAmount === undefined || updateData.totalAmount === null || updateData.totalAmount === "") &&
      Array.isArray(updateData.services)
    ) {
      updateData.totalAmount = updateData.services.reduce(
        (sum, s) => sum + (Number(s.cost ?? s.amount) || 0),
        0
      );
    }

    const existingQuotation = await Quotation.findById(req.params.id);
    if (!existingQuotation) {
      return res.status(404).json({
        success: false,
        message: "Quotation not found.",
      });
    }

    // Handle customer reference and customerSnapshot
    if (updateData.customer && mongoose.Types.ObjectId.isValid(updateData.customer)) {
      const cust = await Customer.findById(updateData.customer).lean();
      if (cust) {
        updateData.customer = cust._id;
        updateData.customerSnapshot = {
          jobNo: cust.jobNo || cust.archivedJobNo || "",
          fullName: cust.fullName || "",
          companyName: cust.companyName || "",
          customerName: cust.fullName || cust.companyName || "",
          address: cust.address || updateData.premises || existingQuotation.premises || "",
          phone: cust.phone || "",
          email: cust.email || "",
          gstNumber: cust.gstNumber || "",
          contactPerson: cust.contactPerson || "",
          snapshotTakenAt: new Date(),
        };
      } else {
        updateData.customer = null;
      }
    } else if (updateData.customer === "" || updateData.customer === null) {
      updateData.customer = null;
      const snapInput = updateData.customerSnapshot || {};
      const existingSnap = existingQuotation.customerSnapshot || {};
      const custName = (
        snapInput.fullName ||
        snapInput.customerName ||
        snapInput.companyName ||
        updateData.customerName ||
        existingSnap.fullName ||
        existingSnap.companyName ||
        ""
      ).trim();

      updateData.customerSnapshot = {
        ...existingSnap,
        ...snapInput,
        fullName: custName || existingSnap.fullName || "",
        customerName: custName || existingSnap.customerName || "",
        companyName: snapInput.companyName !== undefined ? snapInput.companyName : (existingSnap.companyName || ""),
        address: snapInput.address !== undefined ? snapInput.address : (updateData.premises || existingSnap.address || ""),
        phone: snapInput.phone !== undefined ? snapInput.phone : (existingSnap.phone || ""),
        email: snapInput.email !== undefined ? snapInput.email : (existingSnap.email || ""),
        gstNumber: snapInput.gstNumber !== undefined ? snapInput.gstNumber : (existingSnap.gstNumber || ""),
        contactPerson: snapInput.contactPerson !== undefined ? snapInput.contactPerson : (existingSnap.contactPerson || ""),
        snapshotTakenAt: new Date(),
      };
    } else if (updateData.customerSnapshot) {
      const existingSnap = existingQuotation.customerSnapshot || {};
      updateData.customerSnapshot = {
        ...existingSnap,
        ...updateData.customerSnapshot,
        snapshotTakenAt: new Date(),
      };
    }

    const updatedQuotation = await Quotation.findByIdAndUpdate(
      req.params.id,
      updateData,
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

    return res.status(error.statusCode || 500).json({
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

    return res.status(error.statusCode || 500).json({
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

    if (result.isPdfDirect) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${quotationNumber}.pdf"`);
      res.setHeader("Content-Length", result.buffer.length);
      return res.send(result.buffer);
    }

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

    return res.status(error.statusCode || 500).json({
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

    const quotationNumber =
      quotation.quotationNumber ||
      quotation.quoteNumber ||
      quotation.number ||
      `quotation-${quotation._id}`;

    const fileName = `${quotationNumber}.pdf`;

    if (docxResult.isPdfDirect) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
      res.setHeader("Content-Length", docxResult.buffer.length);
      return res.send(docxResult.buffer);
    }

    const pdfBuffer = await convertDocxToPdf(docxResult.buffer);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.setHeader("Content-Length", pdfBuffer.length);

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Generate quotation PDF error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message,
    });
  }
};
