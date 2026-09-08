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
    status: {
      type: String,
      enum: ["Draft", "Sent", "Completed"],
      default: "Draft",
    },
  },
  { timestamps: true },
);

export default mongoose.model("Renewal", renewalSchema);
