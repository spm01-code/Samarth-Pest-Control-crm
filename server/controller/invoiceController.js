import mongoose from "mongoose";
import Invoice from "../model/invoiceModel.js";
import Customer from "../model/customerModel.js";
import Service from "../model/serviceModel.js";
import CompanySetting from "../model/companySettingModel.js";
import { generateInvoiceDocx } from "../utils/docGenerator.js";
import { convertDocxToPdf } from "../utils/docxToPdf.js";
import { generateDocumentNumber } from "../utils/documentNumberService.js";

const numberToWords = (amount) => {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];

  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  const convertBelowHundred = (number) => {
    if (number < 20) return ones[number];

    const ten = Math.floor(number / 10);
    const one = number % 10;

    return `${tens[ten]} ${ones[one]}`.trim();
  };

  const convertBelowThousand = (number) => {
    const hundred = Math.floor(number / 100);
    const rest = number % 100;

    if (hundred && rest) {
      return `${ones[hundred]} Hundred ${convertBelowHundred(rest)}`;
    }

    if (hundred) {
      return `${ones[hundred]} Hundred`;
    }

    return convertBelowHundred(rest);
  };

  const rupees = Math.round(Number(amount || 0));

  if (rupees === 0) return "Zero";

  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;

  let words = "";

  if (crore) words += `${convertBelowThousand(crore)} Crore `;
  if (lakh) words += `${convertBelowThousand(lakh)} Lakh `;
  if (thousand) words += `${convertBelowThousand(thousand)} Thousand `;
  if (rest) words += convertBelowThousand(rest);

  return words.trim();
};

// ==========================
// CREATE INVOICE
// ==========================

export const createInvoice = async (req, res) => {
  try {
    const {
      customerId,
      services,
      invoiceType = "GST",

      workOrderNumber,
      workOrderDate,

      gstNumber,
      particulars,
      premisesTreated,
      treatmentType,
      hsnCode,
      sacCode,
      amountInWords,

      cgstPercentage,
      sgstPercentage,
      igstPercentage,

      notes,
      dueDate,
    } = req.body;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "Customer ID is required",
      });
    }

    if (!mongoose.isValidObjectId(customerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Customer ID",
      });
    }

    if (!Array.isArray(services) || services.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one service is required",
      });
    }

    const customer = await Customer.findById(customerId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const serviceDocs = await Service.find({
      _id: { $in: services },
      customer: customerId,
    });

    if (serviceDocs.length !== services.length) {
      return res.status(400).json({
        success: false,
        message: "One or more selected services do not belong to this customer",
      });
    }

    const subtotal = serviceDocs.reduce(
      (sum, service) => sum + service.amount,
      0,
    );

    if (!["GST", "NON_GST"].includes(invoiceType)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Invoice type must be GST or NON_GST",
        });
    }

    const isGstInvoice = invoiceType === "GST";
    const cgstRate = isGstInvoice ? Number(cgstPercentage || 0) : 0;
    const sgstRate = isGstInvoice ? Number(sgstPercentage || 0) : 0;
    const igstRate = isGstInvoice ? Number(igstPercentage || 0) : 0;
    const cgstAmount = (subtotal * cgstRate) / 100;
    const sgstAmount = (subtotal * sgstRate) / 100;
    const igstAmount = (subtotal * igstRate) / 100;

    const totalTax = cgstAmount + sgstAmount + igstAmount;

    const totalAmount = subtotal + totalTax;

    const { documentNumber: invoiceNumber } = await generateDocumentNumber(
      "INVOICE"
    );

    const invoice = await Invoice.create({
      invoiceNumber,

      invoiceDate: new Date(),

      invoiceType,

      dueDate,

      customer: customer._id,

      services: serviceDocs.map((service) => service._id),

      workOrderNumber,
      workOrderDate,

      gstNumber: isGstInvoice ? gstNumber : "",

      particulars,

      premisesTreated,
      treatmentType,

      hsnCode: isGstInvoice ? hsnCode : "",
      sacCode: isGstInvoice ? sacCode : "",

      tax: {
        cgstPercentage: cgstRate,
        cgstAmount,

        sgstPercentage: sgstRate,
        sgstAmount,

        igstPercentage: igstRate,
        igstAmount,
      },

      subtotal,

      totalTax,

      totalAmount,

      amountInWords:
        amountInWords?.trim() || `Rupees ${numberToWords(totalAmount)} Only`,

      balanceAmount: totalAmount,

      notes,

      generatedBy: req.admin._id,
    });

    const populatedInvoice = await invoice.populate([
      {
        path: "customer",
      },
      {
        path: "services",
      },
      {
        path: "generatedBy",
        select: "-password -refreshToken",
      },
    ]);

    res.status(201).json({
      success: true,
      invoice: populatedInvoice,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================
// GET ALL INVOICES
// ==========================

export const getInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find({
      isDeleted: false,
    })
      .populate("customer")
      .populate("services")
      .populate("generatedBy", "-password -refreshToken")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: invoices.length,
      invoices,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================
// GET SINGLE INVOICE
// ==========================

export const getInvoiceById = async (req, res) => {
  try {
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      isDeleted: false,
    })
      .populate("customer")
      .populate("services")
      .populate("generatedBy", "-password -refreshToken");

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    res.status(200).json({
      success: true,
      invoice,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================
// UPDATE INVOICE
// ==========================

export const updateInvoice = async (req, res) => {
  try {
    const updateData = { ...req.body };

    // Optional enum fields must be omitted when the form has no selection.
    // Mongoose validates an empty string as an enum value, which causes edits
    // to fail for invoices that do not yet have a payment method.
    if (!updateData.paymentMethod) {
      delete updateData.paymentMethod;
    }

    const isNonGstInvoice = updateData.invoiceType === "NON_GST";
    const hasUpdatedTaxRates = [
      "cgstPercentage",
      "sgstPercentage",
      "igstPercentage",
    ].some((field) => Object.hasOwn(updateData, field));

    if (isNonGstInvoice || hasUpdatedTaxRates) {
      const existingInvoice = await Invoice.findById(req.params.id);
      if (!existingInvoice) {
        return res
          .status(404)
          .json({ success: false, message: "Invoice not found" });
      }

      if (isNonGstInvoice) {
        updateData.gstNumber = "";
        updateData.hsnCode = "";
        updateData.sacCode = "";
        updateData.tax = {
          cgstPercentage: 0,
          cgstAmount: 0,
          sgstPercentage: 0,
          sgstAmount: 0,
          igstPercentage: 0,
          igstAmount: 0,
        };
        updateData.totalTax = 0;
        updateData.totalAmount = existingInvoice.subtotal;
      } else {
        const rate = (field) => {
          const value = Number(
            updateData[field] ?? existingInvoice.tax?.[field] ?? 0,
          );
          return Number.isFinite(value) && value >= 0 ? value : 0;
        };
        const cgstPercentage = rate("cgstPercentage");
        const sgstPercentage = rate("sgstPercentage");
        const igstPercentage = rate("igstPercentage");
        const cgstAmount = (existingInvoice.subtotal * cgstPercentage) / 100;
        const sgstAmount = (existingInvoice.subtotal * sgstPercentage) / 100;
        const igstAmount = (existingInvoice.subtotal * igstPercentage) / 100;

        updateData.tax = {
          cgstPercentage,
          cgstAmount,
          sgstPercentage,
          sgstAmount,
          igstPercentage,
          igstAmount,
        };
        updateData.totalTax = cgstAmount + sgstAmount + igstAmount;
        updateData.totalAmount = existingInvoice.subtotal + updateData.totalTax;
      }

      updateData.balanceAmount = Math.max(
        0,
        updateData.totalAmount -
          Number(updateData.amountPaid ?? existingInvoice.amountPaid ?? 0),
      );
      delete updateData.cgstPercentage;
      delete updateData.sgstPercentage;
      delete updateData.igstPercentage;
    }

    const invoice = await Invoice.findByIdAndUpdate(req.params.id, updateData, {
      returnDocument: "after",
      runValidators: true,
    })
      .populate("customer")
      .populate("services");

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    res.status(200).json({
      success: true,
      invoice,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================
// UPDATE PAYMENT STATUS
// ==========================

export const updatePaymentStatus = async (req, res) => {
  try {
    const { paymentStatus, paymentMethod, amountPaid, transactionReference } =
      req.body;

    const invoice = await Invoice.findById(req.params.id);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    invoice.paymentStatus = paymentStatus;

    invoice.paymentMethod = paymentMethod;

    invoice.amountPaid = amountPaid;

    invoice.transactionReference = transactionReference;

    invoice.balanceAmount = invoice.totalAmount - amountPaid;

    if (paymentStatus === "Paid") {
      invoice.paymentDate = new Date();
    }

    await invoice.save();

    res.status(200).json({
      success: true,
      invoice,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================
// DELETE INVOICE
// ==========================

export const deleteInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    invoice.isDeleted = true;

    await invoice.save();

    res.status(200).json({
      success: true,
      message: "Invoice deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================
// GENERATE INVOICE DOCX
// ==========================

export const generateInvoiceDocxFile = async (req, res) => {
  try {
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      isDeleted: false,
    })
      .populate("customer")
      .populate("services");

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    const result = await generateInvoiceDocx(invoice);

    const fileName = `${invoice.invoiceNumber}.docx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );

    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    return res.send(result.buffer);
  } catch (error) {
    console.error("Generate invoice DOCX error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const generateInvoicePdf = async (req, res) => {
  try {
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      isDeleted: false,
    })
      .populate("customer")
      .populate("services");

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    const docxResult = await generateInvoiceDocx(invoice);
    const pdfBuffer = await convertDocxToPdf(docxResult.buffer);

    const fileName = `${invoice.invoiceNumber}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.setHeader("Content-Length", pdfBuffer.length);

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Generate invoice PDF error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
