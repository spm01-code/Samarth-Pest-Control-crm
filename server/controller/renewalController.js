import mongoose from "mongoose";
import Renewal from "../model/renewalModel.js";
import CompanySetting from "../model/companySettingModel.js";
import Customer from "../model/customerModel.js";
import { generateContractRenewalDocx } from "../utils/docGenerator.js";
import { convertDocxToPdf } from "../utils/docxToPdf.js";
import { generateDocumentNumber } from "../utils/documentNumberService.js";

const populateRenewal = (query) => {
  return query.populate("customer");
};

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

const getContractPeriodDates = (renewalDate) => {
  const date = renewalDate ? new Date(renewalDate) : new Date();
  let startYear = date.getFullYear();
  let startMonth = date.getMonth() + 1;
  if (startMonth > 11) {
    startMonth = 0;
    startYear += 1;
  }
  const startDate = new Date(startYear, startMonth, 1);
  const endDate = new Date(startYear + 1, startMonth, 0);

  const formatLongDate = (d) =>
    d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).toUpperCase();

  const contractPeriod = `${formatLongDate(startDate)} to ${formatLongDate(endDate)} (12 Months)`;

  return {
    contractStartDate: startDate,
    contractEndDate: endDate,
    contractPeriod,
  };
};

export const createRenewal = async (req, res) => {
  try {
    const {
      customer: customerId,
      renewalDate,
      paymentTerm,
      notes,
      status,
      services,
      contractPeriod: customContractPeriod,
      amountInWords: customAmountInWords,
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

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    if (!Array.isArray(services) || services.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one service is required",
      });
    }

    const subtotal = services.reduce((sum, service) => sum + Number(service.amount || 0), 0);
    const totalAmount = subtotal;

    const { documentNumber: renewalNumber } = await generateDocumentNumber(
      "CONTRACT_RENEWAL"
    );

    const renewalDateVal = renewalDate || new Date();
    const { contractStartDate, contractEndDate, contractPeriod: defaultContractPeriod } = getContractPeriodDates(renewalDateVal);

    const renewalDoc = await Renewal.create({
      renewalNumber,
      renewalDate: renewalDateVal,
      customer: customer._id,
      services,
      contractStartDate,
      contractEndDate,
      contractPeriod: customContractPeriod || defaultContractPeriod,
      subtotal,
      totalTax: 0,
      totalAmount,
      amountInWords: customAmountInWords || `Rupees ${numberToWords(totalAmount)} Only`,
      paymentTerm: paymentTerm || "Quarterly.",
      notes,
      status: status || "Draft",
    });

    const renewal = await populateRenewal(Renewal.findById(renewalDoc._id));

    res.status(201).json({
      success: true,
      message: "Contract renewal created successfully.",
      renewal,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getRenewals = async (_req, res) => {
  try {
    const renewals = await populateRenewal(
      Renewal.find().sort({ createdAt: -1 }),
    );
    res.status(200).json({ success: true, renewals });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getRenewal = async (req, res) => {
  try {
    const renewal = await populateRenewal(Renewal.findById(req.params.id));
    if (!renewal) return res.status(404).json({ success: false, message: "Contract renewal not found." });
    res.status(200).json({ success: true, renewal });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateRenewal = async (req, res) => {
  try {
    const updateData = { ...req.body };
    const existingRenewal = await Renewal.findById(req.params.id);
    if (!existingRenewal) {
      return res.status(404).json({ success: false, message: "Contract renewal not found." });
    }

    if (updateData.services !== undefined) {
      if (!Array.isArray(updateData.services) || updateData.services.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one service is required",
        });
      }
      const subtotal = updateData.services.reduce((sum, s) => sum + Number(s.amount || 0), 0);
      updateData.subtotal = subtotal;
      updateData.totalAmount = subtotal;
      updateData.amountInWords = `Rupees ${numberToWords(subtotal)} Only`;
    }

    if (updateData.renewalDate) {
      const { contractStartDate, contractEndDate, contractPeriod } = getContractPeriodDates(updateData.renewalDate);
      updateData.contractStartDate = updateData.contractStartDate || contractStartDate;
      updateData.contractEndDate = updateData.contractEndDate || contractEndDate;
      updateData.contractPeriod = updateData.contractPeriod || contractPeriod;
    }

    const updatedRenewal = await Renewal.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true },
    );

    const renewal = updatedRenewal
      ? await populateRenewal(Renewal.findById(updatedRenewal._id))
      : null;

    if (!renewal)
      return res.status(404).json({ success: false, message: "Contract renewal not found." });
    res.status(200).json({ success: true, message: "Contract renewal updated successfully.", renewal });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteRenewal = async (req, res) => {
  try {
    const renewal = await Renewal.findByIdAndDelete(req.params.id);
    if (!renewal) return res.status(404).json({ success: false, message: "Contract renewal not found." });
    res.status(200).json({ success: true, message: "Contract renewal deleted successfully." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const generateRenewalDocx = async (req, res) => {
  try {
    const renewal = await populateRenewal(Renewal.findById(req.params.id));

    if (!renewal) {
      return res.status(404).json({
        success: false,
        message: "Contract renewal not found.",
      });
    }

    const result = await generateContractRenewalDocx(renewal);

    const renewalNumber =
      renewal.renewalNumber ||
      `renewal-${renewal._id}`;

    const fileName = `${renewalNumber}.docx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );

    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    res.setHeader("Content-Length", result.buffer.length);

    return res.send(result.buffer);
  } catch (error) {
    console.error("Generate contract renewal DOCX error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const generateRenewalPdf = async (req, res) => {
  try {
    const renewal = await populateRenewal(Renewal.findById(req.params.id));

    if (!renewal) {
      return res.status(404).json({
        success: false,
        message: "Contract renewal not found.",
      });
    }

    const docxResult = await generateContractRenewalDocx(renewal);
    const pdfBuffer = await convertDocxToPdf(docxResult.buffer);

    const renewalNumber =
      renewal.renewalNumber ||
      `renewal-${renewal._id}`;

    const fileName = `${renewalNumber}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.setHeader("Content-Length", pdfBuffer.length);

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Generate contract renewal PDF error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
