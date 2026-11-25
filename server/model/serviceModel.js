import mongoose from "mongoose";

const serviceSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: false,
      validate: {
        validator: function (v) {
          if (this && this.frequency) {
            const freq = String(this.frequency).trim().toLowerCase();
            if (
              freq === "one-time" ||
              freq === "onetime" ||
              freq === "one time" ||
              freq === "one-time-job" ||
              freq === "onetimejob" ||
              freq === "one time job"
            ) {
              return true;
            }
            return v != null;
          }
          return true;
        },
        message: "Customer is required for recurring services",
      },
    },
    customerName: {
      type: String,
      trim: true,
    },
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: false,
    },
    jobNo: {
      type: String,
      trim: true,
    },
    documentNumber: {
      type: String,
      trim: true,
    },
    customerSnapshot: {
      jobNo: { type: String, trim: true },
      customerName: { type: String, trim: true },
      fullName: { type: String, trim: true },
      companyName: { type: String, trim: true },
      address: { type: String, trim: true },
      phone: { type: String, trim: true },
      email: { type: String, trim: true },
      gstNumber: { type: String, trim: true },
      contactPerson: { type: String, trim: true },
      snapshotTakenAt: { type: Date, default: Date.now },
    },
    operatorName: {
      type: String,
      trim: true,
    },
    serviceName: {
      type: String,
      required: true,
      trim: true,
    },
    serviceTime: {
      type: String,
      trim: true,
    },
    area: {
      type: String,
      trim: true,
    },
    locationOfPest: {
      type: String,
      trim: true,
    },
    reference: {
      type: String,
      trim: true,
    },
    clientReference: {
      type: String,
      trim: true,
    },
    contactPerson: {
      type: String,
      trim: true,
    },
    contactNumber: {
      type: String,
      trim: true,
    },
    paymentDetails: {
      type: String,
      trim: true,
    },
    clientSignature: {
      type: String,
      trim: true,
    },
    serviceOccurrences: [
      {
        serviceNo: {
          type: String,
          trim: true,
        },
        occurrenceType: {
          type: String,
          default: "1st-service",
        },
        serviceDate: {
          type: Date,
        },
        serviceTime: {
          type: String,
          trim: true,
        },
        operatorName: {
          type: String,
          trim: true,
        },
        employee: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Employee",
        },
        amount: {
          type: Number,
          default: 0,
        },
        paymentStatus: {
          type: String,
          default: "Unpaid",
        },
        clientSignature: {
          type: String,
          trim: true,
        },
        paymentDetails: {
          type: String,
          trim: true,
        },
        remark: {
          type: String,
          trim: true,
        },
      },
    ],
    remark: {
      type: String,
      trim: true,
    },
    desc: {
      type: String,
      trim: true,
    },
    frequency: {
      type: String,
      required: true,
      trim: true,
    },

    frequencyType: {
      type: String,
      enum: ["calendar_frequency", "visit_count", "on_demand", "single"],
      default: "calendar_frequency",
    },

    contractVisitCount: {
      type: Number,
      default: null,
    },

    rawFrequency: {
      type: String,
      trim: true,
    },

    serviceDate: {
      type: Date,
      required: true,
    },

    nextServiceDate: {
      type: Date,
    },

    upcomingServiceDates: [
      {
        type: Date,
      },
    ],

    address: {
      type: String,
      required: true,
      trim: true,
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

    totalAmount: {
      type: Number,
      default: 0,
    },

    paidAmount: {
      type: Number,
      default: 0,
    },

    balanceAmount: {
      type: Number,
      default: 0,
    },

    paymentStatus: {
      type: String,
      enum: ["Paid", "Partially Paid", "Unpaid"],
      default: "Unpaid",
    },

    paymentHistory: [
      {
        receivedAmount: { type: Number, default: 0 },
        amount: { type: Number, default: 0 },
        date: { type: Date, default: Date.now },
        paymentDate: { type: Date, default: Date.now },
        mode: { type: String, trim: true },
        paymentMode: { type: String, trim: true },
        balance: { type: Number, default: 0 },
        balanceAfter: { type: Number, default: 0 },
        remark: { type: String, trim: true },
        note: { type: String, trim: true },
        recordedAt: { type: Date, default: Date.now },
      },
    ],

    status: {
      type: String,
      enum: [
        "pending",
        "active",
        "due",
        "expired",
        "completed",
        "cancelled",
      ],
      default: "pending",
    },

    importMeta: {
      batchId: { type: String, index: true },
      sourceJobNo: { type: String, trim: true },
      sourceRows: [{ type: Number }],
      importedAt: { type: Date },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes:
// 1. One-Time Job Document uniqueness independently guaranteed on documentNumber
serviceSchema.index({ documentNumber: 1 }, { unique: true, sparse: true });

// 2. Partial unique index on jobNo for legacy one-time services where documentNumber is not set
serviceSchema.index(
  { jobNo: 1 },
  {
    name: "jobNo_one_time_partial_unique",
    unique: true,
    partialFilterExpression: {
      frequency: "one-time",
      jobNo: { $gt: "" },
    },
  }
);

// 3. General non-unique index on jobNo for fast query across recurring services
serviceSchema.index({ jobNo: 1 });

const Service = mongoose.model("Service", serviceSchema);

export default Service;
