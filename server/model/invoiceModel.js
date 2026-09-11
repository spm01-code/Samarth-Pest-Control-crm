import mongoose from "mongoose";

const invoiceSchema = new mongoose.Schema(
  {
    // =====================
    // Invoice Details
    // =====================

    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    invoiceDate: {
      type: Date,
      default: Date.now,
    },

    invoiceType: {
      type: String,
      enum: ["GST", "NON_GST"],
      default: "GST",
      required: true,
    },

    dueDate: {
      type: Date,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },

    billingPeriod: {
      type: String,
      trim: true,
    },

    contractPeriod: {
      type: String,
      trim: true,
    },

    // Work Order Details
    workOrderNumber: {
      type: String,
      trim: true,
    },

    workOrderDate: {
      type: Date,
    },

    // GST Details
    gstNumber: {
      type: String,
      trim: true,
    },

    // Invoice Content
    particulars: {
      type: String,
      default:
        "Being Charges for pest management service rendered as details mentioned below.",
    },

    premisesTreated: {
      type: String,
      trim: true,
    },

    treatmentType: {
      type: String,
      trim: true,
    },

    hsnCode: {
      type: String,
      trim: true,
    },

    sacCode: {
      type: String,
      trim: true,
    },

    // =====================
    // Service Details
    // =====================

    services: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Service",
        required: true,
      },
    ],

    // =====================
    // Tax Details
    // =====================

    tax: {
      cgstPercentage: {
        type: Number,
        default: 0,
      },

      cgstAmount: {
        type: Number,
        default: 0,
      },

      sgstPercentage: {
        type: Number,
        default: 0,
      },

      sgstAmount: {
        type: Number,
        default: 0,
      },

      igstPercentage: {
        type: Number,
        default: 0,
      },

      igstAmount: {
        type: Number,
        default: 0,
      },
    },

    // =====================
    // Invoice Amounts
    // =====================

    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },

    totalTax: {
      type: Number,
      required: true,
      default: 0,
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    amountInWords: {
      type: String,
      trim: true,
      default: "",
    },

    // =====================
    // Payment Details
    // =====================

    paymentStatus: {
      type: String,
      enum: ["Pending", "Partially Paid", "Paid", "Overdue", "Cancelled"],
      default: "Pending",
    },

    paymentMethod: {
      type: String,
      enum: ["Cash", "UPI", "Bank Transfer", "Cheque", "Card"],
    },

    amountPaid: {
      type: Number,
      default: 0,
    },

    balanceAmount: {
      type: Number,
      default: 0,
    },

    paymentDate: {
      type: Date,
    },

    transactionReference: {
      type: String,
      trim: true,
    },

    // =====================
    // Additional Information
    // =====================

    notes: {
      type: String,
      trim: true,
    },

    // =====================
    // PDF Information
    // =====================

    pdfFileName: {
      type: String,
      trim: true,
    },

    pdfPath: {
      type: String,
      trim: true,
    },

    // =====================
    // Invoice Status
    // =====================

    status: {
      type: String,
      enum: ["Draft", "Generated", "Sent", "Cancelled"],
      default: "Generated",
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    // Additional Tax / Deductions
    tds: {
      type: Number,
      default: 0,
    },

    rtn: {
      type: Number,
      default: 0,
    },

    // =====================
    // Payment History (populated by importer from Excel payment columns)
    // =====================

    paymentHistory: [
      {
        receivedAmount: { type: Number, default: 0 },
        date: { type: Date },
        mode: { type: String, trim: true },
        balance: { type: Number, default: 0 },
        remark: { type: String, trim: true },
      },
    ],

    gstFile: {
      type: String,
      trim: true,
    },

    // =====================
    // Audit
    // =====================

    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: false,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("Invoice", invoiceSchema);
