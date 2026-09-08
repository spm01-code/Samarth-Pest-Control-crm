import mongoose from "mongoose";

const companySettingSchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      trim: true,
    },

    registerOffice: {
      type: String,
      trim: true,
    },

    corporateOffice: {
      type: String,
      trim: true,
    },

    phone: {
      type: String,
      trim: true,
    },

    email: {
      type: String,
      trim: true,
    },

    website: {
      type: String,
      trim: true,
    },

    // Bank details
    bankName: {
      type: String,
      trim: true,
    },

    gstAccountNumber: {
      type: String,
      trim: true,
    },

    nonGstAccountNumber: {
      type: String,
      trim: true,
    },

    ifsc: {
      type: String,
      trim: true,
    },

    pan: {
      type: String,
      trim: true,
    },

    upiId: {
      type: String,
      trim: true,
    },

    // Optional file paths for later
    logoPath: {
      type: String,
      trim: true,
    },

    signaturePath: {
      type: String,
      trim: true,
    },

    qrCodePath: {
      type: String,
      trim: true,
    },

    // Prefix settings
    numberingYear: {
      type: mongoose.Schema.Types.Mixed,
      default: () => new Date().getFullYear(),
    },

    quotationPrefix: {
      type: String,
      trim: true,
      default: "QTN-",
    },

    invoicePrefix: {
      type: String,
      trim: true,
      default: "INV-",
    },

    renewalPrefix: {
      type: String,
      trim: true,
      default: "REN-",
    },

    // Form compatibility fields
    companyAddressReg: {
      type: String,
      trim: true,
    },

    companyAddress: {
      type: String,
      trim: true,
    },

    companyEmail: {
      type: String,
      trim: true,
    },

    companyPhone: {
      type: String,
      trim: true,
    },

    companyWebsite: {
      type: String,
      trim: true,
    },

    companyTaxId: {
      type: String,
      trim: true,
    },

    gstBankName: {
      type: String,
      trim: true,
    },

    gstBankAccount: {
      type: String,
      trim: true,
    },

    gstBankIfsc: {
      type: String,
      trim: true,
    },

    nongstBankName: {
      type: String,
      trim: true,
    },

    nongstBankAccount: {
      type: String,
      trim: true,
    },

    nongstBankIfsc: {
      type: String,
      trim: true,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("CompanySetting", companySettingSchema);
