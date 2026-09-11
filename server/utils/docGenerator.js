import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

import DocumentTemplate from "../model/documentTemplateModel.js";
import CompanySetting from "../model/companySettingModel.js";

// ============================================================
// HELPERS
// ============================================================

const formatDate = (date) => {
  if (!date) return "";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsedDate);
};

const formatAmount = (amount) => {
  const value = Number(amount);

  if (Number.isNaN(value)) {
    return "0.00";
  }

  return value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const getGstCode = (gstNumber) => {
  if (!gstNumber) return "";

  const match = String(gstNumber).match(/^(\d{2})/);

  return match ? match[1] : "";
};

/**
 * Returns the first non-empty value.
 */
const firstValue = (...values) => {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return "";
};

const isPlaceholder = (value) => {
  if (value === undefined || value === null) return true;
  const s = String(value).trim().toUpperCase();
  return (
    s === "" ||
    s === "N/A" ||
    s === "NA" ||
    s === "-" ||
    s === "--" ||
    s === "NULL" ||
    s === "UNDEFINED" ||
    s === "ADDRESS NOT PROVIDED"
  );
};

const firstNonPlaceholderValue = (...values) => {
  for (const value of values) {
    if (!isPlaceholder(value)) {
      return typeof value === "string" ? value.trim() : value;
    }
  }

  return "";
};

export const getBillingPeriod = (invoiceDate) => {
  if (!invoiceDate) return "";
  const date = new Date(invoiceDate);
  if (Number.isNaN(date.getTime())) return "";
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);

  const formatDateString = (d) => {
    const day = String(d.getDate()).padStart(2, "0");
    const month = d.toLocaleDateString("en-GB", { month: "long" }).toUpperCase();
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  };

  return `${formatDateString(start)} to ${formatDateString(end)}`;
};

export const getContractPeriodDates = (renewalDate) => {
  const date = renewalDate ? new Date(renewalDate) : new Date();
  if (Number.isNaN(date.getTime())) {
    return { contractPeriod: "" };
  }
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

export const numberToWords = (amount) => {
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

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

/**
 * Get active document template.
 */
const getActiveTemplate = async (documentType) => {
  const template = await DocumentTemplate.findOne({
    documentType,
    isActive: true,
  });

  if (!template) {
    throw new Error(`No active ${documentType} template found`);
  }

  if (!template.filePath) {
    throw new Error("Template file path is missing");
  }

  let resolvedPath = template.filePath;
  if (!fs.existsSync(resolvedPath)) {
    const fileName = path.basename(resolvedPath);
    const localUploadsPath = path.resolve(process.cwd(), "uploads", "templates", fileName);
    if (fs.existsSync(localUploadsPath)) {
      resolvedPath = localUploadsPath;
    } else {
      throw new Error(
        "The active template file could not be found on the server",
      );
    }
  }

  return {
    ...(template.toObject ? template.toObject() : template),
    filePath: resolvedPath,
  };
};

/**
 * Load DOCX template.
 */
const loadDocxTemplate = (filePath) => {
  const content = fs.readFileSync(filePath, "binary");

  const zip = new PizZip(content);

  return new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });
};

/**
 * Generate DOCX buffer.
 */
const generateBuffer = (doc) => {
  return doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
};

/**
 * Get company settings.
 */
const getCompanySettings = async () => {
  return await CompanySetting.findOne();
};

// ============================================================
// COMPANY DATA
// ============================================================

const buildCompanyData = (companySettings) => {
  return {
    companyName: companySettings?.companyName || "",

    registerOffice: companySettings?.registerOffice || "",

    corporateOffice: companySettings?.corporateOffice || "",

    companyPhone: companySettings?.phone || "",

    phone: companySettings?.phone || "",

    companyEmail: companySettings?.email || "",

    email: companySettings?.email || "",

    companyWebsite: companySettings?.website || "",

    website: companySettings?.website || "",

    bankName: companySettings?.bankName || "",

    gstAccountNumber: companySettings?.gstAccountNumber || "",

    nonGstAccountNumber: companySettings?.nonGstAccountNumber || "",

    ifsc: companySettings?.ifsc || "",

    pan: companySettings?.pan || "",

    upiId: companySettings?.upiId || "",

    logoPath: companySettings?.logoPath || "",

    signaturePath: companySettings?.signaturePath || "",

    qrCodePath: companySettings?.qrCodePath || "",
  };
};

// ============================================================
// CUSTOMER DATA
// ============================================================

const buildCustomerData = (customer) => {
  customer = customer || {};

  return {
    customerName: customer.companyName || customer.fullName || "",

    customerFullName: customer.fullName || "",

    customerCompanyName: customer.companyName || "",

    customerAddress: customer.address || "",

    customerPhone: customer.phone || "",

    customerAlternatePhone: customer.alternatePhone || "",

    customerEmail: customer.email || "",

    customerType: customer.customerType || "",
  };
};

// ============================================================
// INVOICE SERVICES
// ============================================================

const buildInvoiceServices = (invoice) => {
  if (Array.isArray(invoice?.services) && invoice.services.length > 0) {
    return invoice.services.map((service, index) => {
      const premisesTreated = firstNonPlaceholderValue(
        invoice?.premisesTreated,
        service?.premisesTreated,
        service?.address,
        service?.location,
        invoice?.customer?.address,
        "",
      );
      const address = firstNonPlaceholderValue(
        service?.address,
        service?.location,
        invoice?.premisesTreated,
        invoice?.customer?.address,
        "",
      );

      return {
        serviceNumber: String(index + 1),
        serviceName: service?.serviceName || invoice?.treatmentType || "",
        description: service?.desc || "",
        amount: formatAmount(service?.amount),
        serviceDate: formatDate(service?.serviceDate),
        nextServiceDate: formatDate(service?.nextServiceDate),
        address,
        location: address,
        frequency: service?.frequency || "",
        status: service?.status || "",
        premisesTreated,
        treatmentType: service?.serviceName || invoice?.treatmentType || "",
      };
    });
  }

  if (invoice?.premisesTreated || invoice?.treatmentType) {
    const premisesTreated = firstNonPlaceholderValue(
      invoice?.premisesTreated,
      invoice?.customer?.address,
      "",
    );

    return [
      {
        serviceNumber: "1",
        serviceName: invoice?.treatmentType || "Pest Control",
        description: "",
        amount: formatAmount(invoice?.subtotal || invoice?.totalAmount),
        serviceDate: formatDate(invoice?.invoiceDate),
        nextServiceDate: "",
        address: premisesTreated,
        location: premisesTreated,
        frequency: "",
        status: "",
        premisesTreated,
        treatmentType: invoice?.treatmentType || "",
      },
    ];
  }

  return [];
};

// ============================================================
// INVOICE TREATMENTS
// ============================================================

const buildInvoiceTreatments = (invoice) => {
  if (Array.isArray(invoice?.services) && invoice.services.length > 0) {
    return invoice.services.map((service, index) => ({
      treatmentNumber: String(index + 1),
      premisesTreated: firstNonPlaceholderValue(
        invoice?.premisesTreated,
        service?.premisesTreated,
        service?.address,
        service?.location,
        invoice?.customer?.address,
        "",
      ),
      treatmentType: service?.serviceName || invoice?.treatmentType || "",
      description: service?.desc || "",
      amount: formatAmount(service?.amount),
      serviceDate: formatDate(service?.serviceDate),
      nextServiceDate: formatDate(service?.nextServiceDate),
      frequency: service?.frequency || "",
      status: service?.status || "",
    }));
  }

  if (invoice?.premisesTreated || invoice?.treatmentType) {
    return [
      {
        treatmentNumber: "1",
        premisesTreated: firstNonPlaceholderValue(
          invoice?.premisesTreated,
          invoice?.customer?.address,
          "",
        ),
        treatmentType: invoice?.treatmentType || "",
        description: "",
        amount: formatAmount(invoice?.subtotal || invoice?.totalAmount),
        serviceDate: formatDate(invoice?.invoiceDate),
        nextServiceDate: "",
        frequency: "",
        status: "",
      },
    ];
  }

  return [];
};

// ============================================================
// QUOTATION SERVICES
// ============================================================

const buildQuotationServices = (quotation) => {
  if (!Array.isArray(quotation?.services)) {
    return [];
  }

  return quotation.services.map((service, index) => ({
    serviceNumber: String(index + 1),

    location: firstNonPlaceholderValue(
      service?.location,
      service?.address,
      service?.premisesTreated,
      quotation?.premisesTreated,
      quotation?.premises,
      quotation?.customer?.address,
      "",
    ),

    serviceName: firstValue(service?.serviceName, service?.name),

    frequency: firstValue(service?.frequency),

    amount: formatAmount(
      firstValue(service?.amount, service?.serviceCost, service?.cost),
    ),

    description: firstValue(service?.desc, service?.description),

    serviceDate: formatDate(service?.serviceDate),

    nextServiceDate: formatDate(service?.nextServiceDate),

    status: service?.status || "",
  }));
};

// ============================================================
// CONTRACT RENEWAL SERVICES
// ============================================================

/**
 * Builds the repeating service rows used by
 * the Contract Renewal DOCX template.
 *
 * Word template:
 *
 * {#services}
 * {serviceNumber}
 * {serviceName}
 * {location}
 * {frequency}
 * {amount}
 * {/services}
 */
const buildRenewalServices = (renewal) => {
  if (!Array.isArray(renewal?.services)) {
    return [];
  }

  return renewal.services.map((service, index) => {
    const serviceName = firstValue(
      service?.serviceName,
      service?.name,
      service?.serviceType,
    );

    const location = firstNonPlaceholderValue(
      service?.address,
      service?.location,
      service?.premisesTreated,
      renewal?.premisesTreated,
      renewal?.premises,
      renewal?.address,
      renewal?.customer?.address,
      "",
    );

    const frequency = firstValue(
      service?.frequency,
      service?.serviceFrequency,
      service?.periodicity,
    );

    const amount = firstValue(
      service?.amount,
      service?.serviceCost,
      service?.cost,
      service?.price,
    );

    return {
      // ----------------------------------------------------
      // Row Number
      // ----------------------------------------------------

      serviceNumber: String(index + 1),

      number: String(index + 1),

      // ----------------------------------------------------
      // Service
      // ----------------------------------------------------

      serviceName,

      serviceType: serviceName,

      treatmentType: serviceName,

      // ----------------------------------------------------
      // Location
      // ----------------------------------------------------

      location,

      premisesTreated: location,

      address: location,

      // ----------------------------------------------------
      // Frequency
      // ----------------------------------------------------

      frequency,

      serviceFrequency: frequency,

      // ----------------------------------------------------
      // Amount
      // ----------------------------------------------------

      amount: formatAmount(amount),

      serviceCost: formatAmount(amount),

      price: formatAmount(amount),

      cost: formatAmount(amount),

      // ----------------------------------------------------
      // Additional Fields
      // ----------------------------------------------------

      description: firstValue(service?.desc, service?.description),

      serviceDate: formatDate(service?.serviceDate),

      nextServiceDate: formatDate(service?.nextServiceDate),

      status: service?.status || "",
    };
  });
};

// ============================================================
// 1. INVOICE DOCX GENERATOR
// ============================================================

export const generateInvoiceDocx = async (invoice) => {
  try {
    if (!invoice) {
      throw new Error("Invoice is required");
    }

    // ------------------------------------------------------
    // Invoice Type
    // ------------------------------------------------------

    const isGstInvoice = invoice.invoiceType === "GST";

    const documentType = isGstInvoice ? "tax-invoice" : "invoice";

    // ------------------------------------------------------
    // Template
    // ------------------------------------------------------

    const template = await getActiveTemplate(documentType);

    // ------------------------------------------------------
    // Company
    // ------------------------------------------------------

    const companySettings = await getCompanySettings();

    const companyData = buildCompanyData(companySettings);

    // ------------------------------------------------------
    // DOCX
    // ------------------------------------------------------

    const doc = loadDocxTemplate(template.filePath);

    // ------------------------------------------------------
    // Customer
    // ------------------------------------------------------

    const customerData = buildCustomerData(invoice.customer);

    // ------------------------------------------------------
    // Services
    // ------------------------------------------------------

    const services = buildInvoiceServices(invoice);

    const treatments = buildInvoiceTreatments(invoice);

    // ------------------------------------------------------
    // Bank
    // ------------------------------------------------------

    const accountNumber = isGstInvoice
      ? companySettings?.gstAccountNumber || ""
      : companySettings?.nonGstAccountNumber || "";

    // ------------------------------------------------------
    // Data
    // ------------------------------------------------------

    const data = {
      ...companyData,

      ...customerData,

      invoiceNumber: invoice.invoiceNumber || "",

      invoiceDate: formatDate(invoice.invoiceDate),

      dueDate: formatDate(invoice.dueDate),

      invoiceType: invoice.invoiceType || "",

      billingPeriod: firstValue(
        invoice.billingPeriod,
        invoice.invoiceDate ? getBillingPeriod(invoice.invoiceDate) : "",
        "",
      ),

      contractPeriod: firstValue(invoice.contractPeriod, ""),

      workOrderNumber: invoice.workOrderNumber || "",

      workOrderDate: formatDate(invoice.workOrderDate),

      gstNumber: isGstInvoice ? invoice.gstNumber || "" : "",

      gstCode: isGstInvoice ? getGstCode(invoice.gstNumber) : "",

      hsnCode: isGstInvoice ? invoice.hsnCode || "" : "",

      sacCode: isGstInvoice ? invoice.sacCode || "" : "",

      particulars: invoice.particulars || "",

      premisesTreated: firstNonPlaceholderValue(
        invoice.premisesTreated,
        invoice.services?.[0]?.address,
        invoice.customer?.address,
        "",
      ),

      treatmentType: invoice.treatmentType || "",

      subtotal: formatAmount(invoice.subtotal),

      totalTax: formatAmount(invoice.totalTax),

      cgstPercentage: isGstInvoice
        ? Number(invoice.tax?.cgstPercentage || 0).toFixed(2)
        : "0.00",

      cgstAmount: isGstInvoice ? formatAmount(invoice.tax?.cgstAmount) : "0.00",

      sgstPercentage: isGstInvoice
        ? Number(invoice.tax?.sgstPercentage || 0).toFixed(2)
        : "0.00",

      sgstAmount: isGstInvoice ? formatAmount(invoice.tax?.sgstAmount) : "0.00",

      igstPercentage: isGstInvoice
        ? Number(invoice.tax?.igstPercentage || 0).toFixed(2)
        : "0.00",

      igstAmount: isGstInvoice ? formatAmount(invoice.tax?.igstAmount) : "0.00",

      totalAmount: formatAmount(invoice.totalAmount),

      amountInWords: invoice.amountInWords || "",

      paymentStatus: invoice.paymentStatus || "",

      paymentMethod: invoice.paymentMethod || "",

      amountPaid: formatAmount(invoice.amountPaid),

      balanceAmount: formatAmount(invoice.balanceAmount),

      paymentDate: formatDate(invoice.paymentDate),

      transactionReference: invoice.transactionReference || "",

      notes: invoice.notes || "",

      bankName: companySettings?.bankName || "",

      accountNumber,

      gstAccountNumber: companySettings?.gstAccountNumber || "",

      nonGstAccountNumber: companySettings?.nonGstAccountNumber || "",

      ifsc: companySettings?.ifsc || "",

      pan: companySettings?.pan || "",

      upiId: companySettings?.upiId || "",

      treatments,

      services,
    };

    // ------------------------------------------------------
    // Render
    // ------------------------------------------------------

    doc.render(data);

    const buffer = generateBuffer(doc);

    return {
      buffer,
      template,
      documentType,
      data,
    };
  } catch (error) {
    console.error("Invoice DOCX generation error:", error);

    throw error;
  }
};

// ============================================================
// 2. QUOTATION DOCX GENERATOR
// ============================================================
// 2A. ATT QUOTATION DOCX GENERATOR
// ============================================================

export const generateAttQuotationDocx = async (quotation) => {
  try {
    if (!quotation) {
      throw new Error("Quotation is required");
    }

    let template;
    try {
      template = await getActiveTemplate("att-quotation");
    } catch (_) {
      const fallbackPath = path.resolve(
        process.cwd(),
        "uploads",
        "templates",
        "FORMAT - ATT QTN PLACEHOLDER.docx",
      );
      if (fs.existsSync(fallbackPath)) {
        template = { filePath: fallbackPath, documentType: "att-quotation" };
      } else {
        throw new Error("ATT Quotation template file could not be found");
      }
    }

    const companySettings = await getCompanySettings();
    const companyData = buildCompanyData(companySettings);
    const doc = loadDocxTemplate(template.filePath);
    const customerData = buildCustomerData(quotation.customer);

    const treatments = Array.isArray(quotation.treatments)
      ? quotation.treatments.map((t) => ({
          typeOfTreatment: t.typeOfTreatment || "Anti Termite Pre-construction Treatment",
          warrantyPeriod: t.warrantyPeriod || "",
          chemicalUsed: t.chemicalUsed || "",
          serviceCharges: t.serviceCharges || "",
        }))
      : [];

    const data = {
      ...companyData,
      ...customerData,

      customerName: customerData.customerName,
      customerAddress: customerData.customerAddress,

      quotationNumber: firstValue(
        quotation.quotationNumber,
        quotation.quoteNumber,
        quotation.number,
      ),

      quotationDate: formatDate(
        firstValue(
          quotation.quotationDate,
          quotation.quoteDate,
          quotation.date,
          quotation.createdAt,
        ),
      ),

      subject: firstValue(
        quotation.subject,
        "Anti Termite Pre-construction Treatment at your site.",
      ),

      premises: firstValue(
        quotation.premises,
        customerData.customerAddress,
      ),

      premiseToBeTreated: firstValue(
        quotation.premises,
        customerData.customerAddress,
      ),

      specification: firstValue(
        quotation.specification,
        "Providing Material and Labour For Injecting Chemical Emulsion For Pre-Constructional Anti Termite Treatment. As Per 6313 (Part II) 2013",
      ),

      equipment: firstValue(
        quotation.equipment,
        "Sprayers & Sprinklers Will Be Used To Ensure Proper Penetration Of Chemicals Into the Earth.",
      ),

      paymentTerm: firstValue(
        quotation.paymentTerm,
        "Within 10 Days From The Date Of Submission Of invoice",
      ),

      paymentTerms: firstValue(
        quotation.paymentTerm,
        "Within 10 Days From The Date Of Submission Of invoice",
      ),

      treatments,
    };

    doc.render(data);
    const buffer = generateBuffer(doc);

    return {
      buffer,
      template,
      documentType: "att-quotation",
      data,
    };
  } catch (error) {
    console.error("ATT Quotation DOCX generation error:", error);
    throw error;
  }
};

// ============================================================
// 2B. QUOTATION DOCX GENERATOR (PC QUOTATION / DISPATCHER)
// ============================================================

export const generateQuotationDocx = async (quotation) => {
  try {
    if (!quotation) {
      throw new Error("Quotation is required");
    }

    if (quotation.quotationType === "ATT") {
      return await generateAttQuotationDocx(quotation);
    }

    const template = await getActiveTemplate("quotation");

    const companySettings = await getCompanySettings();

    const companyData = buildCompanyData(companySettings);

    const doc = loadDocxTemplate(template.filePath);

    const customerData = buildCustomerData(quotation.customer);

    const services = buildQuotationServices(quotation);

    const computedServicesTotal = Array.isArray(quotation?.services)
      ? quotation.services.reduce(
          (sum, s) => sum + (Number(s.cost ?? s.amount) || 0),
          0,
        )
      : 0;

    const totalAmount = firstValue(
      quotation.totalAmount,
      quotation.total,
      quotation.grandTotal,
      quotation.amount,
      computedServicesTotal > 0 ? computedServicesTotal : "",
    );

    const data = {
      ...companyData,

      ...customerData,

      quotationNumber: firstValue(
        quotation.quotationNumber,
        quotation.quoteNumber,
        quotation.number,
      ),

      quoteNumber: firstValue(
        quotation.quotationNumber,
        quotation.quoteNumber,
        quotation.number,
      ),

      quotationDate: formatDate(
        firstValue(
          quotation.quotationDate,
          quotation.quoteDate,
          quotation.date,
          quotation.createdAt,
        ),
      ),

      quoteDate: formatDate(
        firstValue(
          quotation.quotationDate,
          quotation.quoteDate,
          quotation.date,
          quotation.createdAt,
        ),
      ),

      validity: firstValue(
        quotation.validity,
        quotation.validUntil,
        quotation.validityPeriod,
      ),

      validUntil: formatDate(quotation.validUntil),

      reference: firstValue(quotation.reference, quotation.referenceNumber),

      subject: firstValue(quotation.subject, quotation.title),

      premisesTreated: firstNonPlaceholderValue(
        quotation.premisesTreated,
        quotation.premises,
        customerData.customerAddress,
        "",
      ),

      particulars: firstValue(
        quotation.particulars,
        quotation.description,
        quotation.notes,
      ),

      terms: firstValue(quotation.terms, quotation.termsAndConditions),

      paymentTerms: firstValue(quotation.paymentTerms, quotation.paymentTerm),

      billingTerm: firstValue(quotation.billingTerm, quotation.billingTerms, "Monthly"),

      billingTerms: firstValue(quotation.billingTerm, quotation.billingTerms, "Monthly"),

      subtotal: formatAmount(quotation.subtotal),

      totalTax: formatAmount(quotation.totalTax),

      totalAmount: formatAmount(totalAmount),

      grandTotal: formatAmount(quotation.grandTotal),

      amountInWords: quotation.amountInWords || "",

      services,
    };

    doc.render(data);

    const buffer = generateBuffer(doc);

    return {
      buffer,
      template,
      documentType: "quotation",
      data,
    };
  } catch (error) {
    console.error("Quotation DOCX generation error:", error);

    throw error;
  }
};

// ============================================================
// 3. CONTRACT RENEWAL DOCX GENERATOR
// ============================================================

export const generateContractRenewalDocx = async (renewal) => {
  try {
    if (!renewal) {
      throw new Error("Contract renewal is required");
    }

    // ------------------------------------------------------
    // ACTIVE TEMPLATE
    // ------------------------------------------------------

    const template = await getActiveTemplate("contract-renewal");

    // ------------------------------------------------------
    // COMPANY SETTINGS
    // ------------------------------------------------------

    const companySettings = await getCompanySettings();

    const companyData = buildCompanyData(companySettings);

    // ------------------------------------------------------
    // LOAD DOCX
    // ------------------------------------------------------

    const doc = loadDocxTemplate(template.filePath);

    // ------------------------------------------------------
    // CUSTOMER
    // ------------------------------------------------------

    const customer = renewal.customer || {};

    const customerData = buildCustomerData(customer);

    // ------------------------------------------------------
    // SERVICES
    // ------------------------------------------------------

    const services = buildRenewalServices(renewal);

    // ------------------------------------------------------
    // CONTRACT DATES
    // ------------------------------------------------------

    const contractStartDate = firstValue(
      renewal.contractStartDate,
      renewal.startDate,
      renewal.fromDate,
      renewal.validFrom,
    );

    const contractEndDate = firstValue(
      renewal.contractEndDate,
      renewal.endDate,
      renewal.toDate,
      renewal.validTo,
    );

    // ------------------------------------------------------
    // CONTRACT NUMBER
    // ------------------------------------------------------

    const contractNumber = firstValue(
      renewal.contractNumber,
      renewal.renewalNumber,
      renewal.number,
      renewal.referenceNumber,
    );

    // ------------------------------------------------------
    // RENEWAL NUMBER
    // ------------------------------------------------------

    const renewalNumber = firstValue(
      renewal.renewalNumber,
      renewal.contractNumber,
      renewal.number,
    );

    // ------------------------------------------------------
    // TOTAL AMOUNT
    // ------------------------------------------------------

    const renewalAmount = firstValue(
      renewal.totalAmount,
      renewal.grandTotal,
      renewal.renewalAmount,
      renewal.amount,
      renewal.total,
    );

    // ------------------------------------------------------
    // CONTRACTEE
    // ------------------------------------------------------

    const contracteeName = firstValue(
      renewal.contracteeName,
      renewal.contractee,
      renewal.contactPerson,
      renewal.contactName,
      customer.fullName,
      customer.companyName,
    );

    const contracteeMobile = firstValue(
      renewal.contracteeMobile,
      renewal.contracteePhone,
      renewal.contactPhone,
      renewal.contactMobile,
      customer.phone,
    );

    // ------------------------------------------------------
    // PREMISES
    // ------------------------------------------------------

    const premisesTreated = firstNonPlaceholderValue(
      renewal.premisesTreated,
      renewal.premises,
      renewal.location,
      renewal.address,
      customer.address,
      "",
    );

    // ------------------------------------------------------
    // SUBJECT
    // ------------------------------------------------------

    const subject = firstValue(
      renewal.subject,
      renewal.title,
      "Pest Management Treatment to your premises.",
    );

    // ------------------------------------------------------
    const defaultRenewalPeriod = renewal.renewalDate
      ? getContractPeriodDates(renewal.renewalDate).contractPeriod
      : "";

    const contractPeriod = firstValue(
      renewal.contractPeriod,
      (contractStartDate && contractEndDate)
        ? `${formatDate(contractStartDate)} to ${formatDate(contractEndDate)}`
        : "",
      defaultRenewalPeriod,
      renewal.period,
      renewal.duration,
      "",
    );

    // ------------------------------------------------------
    // TEMPLATE DATA
    // ------------------------------------------------------

    const data = {
      // ====================================================
      // COMPANY
      // ====================================================

      ...companyData,

      // ====================================================
      // CUSTOMER
      // ====================================================

      ...customerData,

      // ====================================================
      // CONTRACT
      // ====================================================

      contractNumber,

      renewalNumber,

      renewalDate: formatDate(
        firstValue(renewal.renewalDate, renewal.date, renewal.createdAt),
      ),

      contractDate: formatDate(
        firstValue(renewal.contractDate, renewal.date, renewal.createdAt),
      ),

      // ====================================================
      // CONTRACT PERIOD
      // ====================================================

      contractStartDate: formatDate(contractStartDate),

      contractEndDate: formatDate(contractEndDate),

      startDate: formatDate(contractStartDate),

      endDate: formatDate(contractEndDate),

      contractPeriod,

      // ====================================================
      // CUSTOMER / CONTRACTEE
      // ====================================================

      contracteeName,

      contracteeMobile,

      contracteePhone: contracteeMobile,

      contactPerson: contracteeName,

      contactName: contracteeName,

      // ====================================================
      // PREMISES
      // ====================================================

      premisesTreated,

      premises: premisesTreated,

      location: premisesTreated,

      // ====================================================
      // SUBJECT / DESCRIPTION
      // ====================================================

      subject,

      description: firstValue(renewal.description, renewal.desc, renewal.notes),

      particulars: firstValue(
        renewal.particulars,
        renewal.description,
        renewal.desc,
      ),

      serviceName: firstValue(renewal.serviceName, renewal.service),

      treatmentType: firstValue(renewal.treatmentType, renewal.serviceType),

      // ====================================================
      // AMOUNTS
      // ====================================================

      subtotal: formatAmount(renewal.subtotal),

      totalTax: formatAmount(renewal.totalTax),

      totalAmount: formatAmount(renewalAmount),

      grandTotal: formatAmount(renewal.grandTotal),

      renewalAmount: formatAmount(renewal.renewalAmount),

      amount: formatAmount(renewalAmount),

      amountInWords: firstValue(
        renewal.amountInWords,
        renewalAmount ? `Rupees ${numberToWords(renewalAmount)} Only` : "",
        "",
      ),

      // ====================================================
      // PAYMENT
      // ====================================================

      paymentTerms: firstValue(renewal.paymentTerms, renewal.paymentTerm),

      paymentTerm: firstValue(renewal.paymentTerm, renewal.paymentTerms),

      paymentStatus: renewal.paymentStatus || "",

      // ====================================================
      // TERMS
      // ====================================================

      terms: firstValue(renewal.terms, renewal.termsAndConditions),

      termsAndConditions: firstValue(renewal.termsAndConditions, renewal.terms),

      // ====================================================
      // STATUS
      // ====================================================

      status: renewal.status || "",

      // ====================================================
      // DYNAMIC SERVICE TABLE
      // ====================================================

      services,
    };

    // ------------------------------------------------------
    // RENDER TEMPLATE
    // ------------------------------------------------------

    doc.render(data);

    // ------------------------------------------------------
    // GENERATE BUFFER
    // ------------------------------------------------------

    const buffer = generateBuffer(doc);

    return {
      buffer,

      template,

      documentType: "contract-renewal",

      data,
    };
  } catch (error) {
    console.error("Contract Renewal DOCX generation error:", error);

    throw error;
  }
};

// ============================================================
// 4. ONE TIME JOB SERVICE PAPER DOCX GENERATOR
// ============================================================

export const generateOneTimeJobDocx = async (service) => {
  try {
    if (!service) {
      throw new Error("Service is required");
    }

    // ------------------------------------------------------
    // ACTIVE TEMPLATE (DB or fallback)
    // ------------------------------------------------------
    let template;
    try {
      template = await getActiveTemplate("one-time-job");
    } catch (_) {
      const fallbackPath = path.resolve(
        process.cwd(),
        "uploads",
        "templates",
        "FORMAT - ONE TIME JOB.docx",
      );
      if (fs.existsSync(fallbackPath)) {
        template = { filePath: fallbackPath, documentType: "one-time-job" };
      } else {
        throw new Error("One Time Job template file could not be found");
      }
    }

    // ------------------------------------------------------
    // COMPANY SETTINGS
    // ------------------------------------------------------
    const companySettings = await getCompanySettings();
    const companyData = buildCompanyData(companySettings);

    // ------------------------------------------------------
    // LOAD DOCX
    // ------------------------------------------------------
    const doc = loadDocxTemplate(template.filePath);

    // ------------------------------------------------------
    // CUSTOMER & OPERATOR DATA
    // ------------------------------------------------------
    const customer = service.customer || {};
    const customerData = buildCustomerData(customer);

    // ------------------------------------------------------
    // OCCURRENCES MAPPING (1ST, 2ND, 3RD SERVICE / COMPLAINT)
    // ------------------------------------------------------
    const occurrences = Array.isArray(service.serviceOccurrences)
      ? service.serviceOccurrences
      : [];

    const occ1 = occurrences[0] || null;
    const occ2 = occurrences[1] || null;
    const occ3 = occurrences[2] || null;

    // Operator name helper
    const resolveOperator = (occ) => {
      if (!occ) return "";
      return firstValue(
        occ.operatorName,
        occ.employee?.fullName,
        occ.employee?.name,
        ""
      );
    };

    // 1st Service / ONE TIME
    const serviceDate1 = formatDate(
      firstValue(occ1?.serviceDate, service.serviceDate)
    );
    const serviceTime1 = firstValue(occ1?.serviceTime, service.serviceTime, "");
    const operatorName1 = firstValue(
      resolveOperator(occ1),
      service.employee?.fullName,
      service.employee?.name,
      service.operatorName,
      ""
    );
    const clientSignature1 = firstValue(
      occ1?.clientSignature,
      service.clientSignature,
      ""
    );
    const paymentDetails1 = firstValue(
      occ1?.paymentDetails,
      service.paymentDetails,
      ""
    );

    // 2nd Service / Complaint
    const serviceDate2 = occ2?.serviceDate ? formatDate(occ2.serviceDate) : "";
    const serviceTime2 = firstValue(occ2?.serviceTime, "");
    const operatorName2 = resolveOperator(occ2);
    const clientSignature2 = firstValue(occ2?.clientSignature, "");
    const paymentDetails2 = firstValue(occ2?.paymentDetails, "");

    // 3rd Service / Complaint
    const serviceDate3 = occ3?.serviceDate ? formatDate(occ3.serviceDate) : "";
    const serviceTime3 = firstValue(occ3?.serviceTime, "");
    const operatorName3 = resolveOperator(occ3);
    const clientSignature3 = firstValue(occ3?.clientSignature, "");
    const paymentDetails3 = firstValue(occ3?.paymentDetails, "");

    // Frequency formatting
    const rawFreq = String(service.frequency || "One Time Job").trim();
    const formattedFrequency =
      rawFreq.toLowerCase() === "one-time"
        ? "One Time Job"
        : rawFreq.charAt(0).toUpperCase() + rawFreq.slice(1);

    const data = {
      ...companyData,

      jobNo: (() => {
        const raw = firstValue(service.jobNo, service.jobNumber, "");
        return raw.replace(/^job\s*no[\.\s\-\/:]*/i, "");
      })(),

      customerName: customerData.customerName || "Customer",

      customerAddress: firstValue(
        service.address,
        customerData.customerAddress,
        ""
      ),

      address: firstValue(
        service.address,
        customerData.customerAddress,
        ""
      ),

      contactPerson: firstValue(
        service.contactPerson,
        customer.contactPerson,
        customerData.customerName,
        ""
      ),

      contactNumber: firstValue(
        service.contactNumber,
        customer.phone,
        customer.alternatePhone,
        customerData.customerPhone,
        ""
      ),

      serviceName: firstValue(service.serviceName, service.name, ""),

      area: firstValue(service.area, service.premisesArea, ""),

      locationOfPest: firstValue(service.locationOfPest, ""),

      frequency: formattedFrequency,

      serviceCharges: formatAmount(service.amount),

      amount: formatAmount(service.amount),

      // 1st Service Column
      serviceDate1,
      serviceTime1,
      operatorName1,
      clientSignature1,
      paymentDetails1,

      // 2nd Service Column
      serviceDate2,
      serviceTime2,
      operatorName2,
      clientSignature2,
      paymentDetails2,

      // 3rd Service Column
      serviceDate3,
      serviceTime3,
      operatorName3,
      clientSignature3,
      paymentDetails3,

      // Single-occurrence aliases for backward compatibility
      serviceDate: serviceDate1,
      serviceTime: serviceTime1,
      operatorName: operatorName1,
      clientSignature: clientSignature1,
      paymentDetails: paymentDetails1,

      remark: firstValue(service.remark, service.desc, ""),

      gpayNumber: firstValue(companySettings?.phone, "8356080548"),

      accountNumber: firstValue(companySettings?.nonGstAccountNumber, companySettings?.accountNumber, "50200067645163"),

      bankName: firstValue(companySettings?.nonGstBankName, companySettings?.bankName, "HDFC BANK"),

      ifsc: firstValue(companySettings?.nonGstBankIfsc, companySettings?.ifsc, "HDFC0000051"),

      pan: firstValue(companySettings?.pan, "JCHPM5440Q"),

      upiId: firstValue(companySettings?.upiId, "8356080548@okbizaxis"),
    };

    doc.render(data);
    const buffer = generateBuffer(doc);

    return {
      buffer,
      template,
      documentType: "one-time-job",
      data,
    };
  } catch (error) {
    console.error("One Time Job DOCX generation error:", error);
    throw error;
  }
};
