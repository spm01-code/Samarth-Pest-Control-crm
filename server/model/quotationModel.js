import mongoose from "mongoose";

const quotationSchema = new mongoose.Schema(
  {
    quotationNumber: {
      type: String,
      required: true,
      unique: true,
    },

    quotationType: {
      type: String,
      enum: ["PC", "ATT"],
      default: "PC",
    },

    quotationDate: {
      type: Date,
      default: Date.now,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },

    premises: {
      type: String,
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

        cost: {
          type: Number,
          required: true,
        },

        location: {
          type: String,
          trim: true,
        },
      },
    ],

    paymentTerm: {
      type: String,
      default: "Within 10 days from invoice submission.",
    },

    billingTerm: {
      type: String,
      default: "Monthly",
    },

    // ATT Quotation specific fields
    subject: {
      type: String,
      default: "",
    },

    specification: {
      type: String,
      default: "",
    },

    equipment: {
      type: String,
      default: "",
    },

    treatments: [
      {
        typeOfTreatment: {
          type: String,
          default: "",
        },
        warrantyPeriod: {
          type: String,
          default: "",
        },
        chemicalUsed: {
          type: String,
          default: "",
        },
        serviceCharges: {
          type: String,
          default: "",
        },
      },
    ],

    totalAmount: {
      type: Number,
    },

    notes: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: ["Draft", "Sent", "Accepted", "Rejected"],
      default: "Draft",
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("Quotation", quotationSchema);
