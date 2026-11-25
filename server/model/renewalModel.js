import mongoose from "mongoose";

const renewalSchema = new mongoose.Schema(
  {
    renewalNumber: { type: String, required: true, unique: true, trim: true },
    renewalDate: { type: Date, default: Date.now },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    customerSnapshot: {
      jobNo: { type: String, trim: true },
      fullName: { type: String, trim: true },
      companyName: { type: String, trim: true },
      address: { type: String, trim: true },
      phone: { type: String, trim: true },
      email: { type: String, trim: true },
      gstNumber: { type: String, trim: true },
      contactPerson: { type: String, trim: true },
      snapshotTakenAt: { type: Date, default: Date.now },
    },
    services: [
      {
        serviceName: {
          type: String,
          required: true,
        },
        frequency: {
          type: String,
          required: true,
        },
        address: {
          type: String,
        },
        amount: {
          type: Number,
          required: true,
        },
        paymentBasis: {
          type: String,
          enum: ["per-service", "per-month", "per-year"],
          required: false,
        },
        desc: {
          type: String,
        },
      },
    ],
    contractStartDate: {
      type: Date,
    },
    contractEndDate: {
      type: Date,
    },
    contractPeriod: {
      type: String,
      trim: true,
    },
    serviceVisits: [
      {
        visitLabel: { type: String }, // e.g. "1ST SERVICE", "2ND SERVICE", etc.
        visitDateStr: { type: String }, // e.g. "OCT--25"
        scheduledDate: { type: Date },
        status: { type: String, default: "Scheduled" },
      },
    ],
    subtotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
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
      default: 0,
    },
    amountInWords: {
      type: String,
      trim: true,
      default: "",
    },
    paymentTerm: {
      type: String,
      default: "Quarterly.",
    },
    notes: {
      type: String,
      trim: true,
    },
    paymentHistory: [
      {
        receivedAmount: { type: Number, default: 0 },
        date: { type: Date },
        mode: { type: String, trim: true },
        balance: { type: Number, default: 0 },
        remark: { type: String, trim: true },
      },
    ],
    status: {
      type: String,
      enum: ["Draft", "Sent", "Completed"],
      default: "Draft",
    },
    importMeta: {
      batchId: { type: String, index: true },
      sourceJobNo: { type: String, trim: true },
      sourceRows: [{ type: Number }],
      importedAt: { type: Date },
    },
  },
  { timestamps: true },
);

export default mongoose.model("Renewal", renewalSchema);
