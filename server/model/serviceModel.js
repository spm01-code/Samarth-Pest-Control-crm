import mongoose from "mongoose";

const serviceSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
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
        occurrenceType: {
          type: String,
          enum: [
            "1st-service",
            "2nd-service",
            "3rd-service",
            "complaint",
            "follow-up",
          ],
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
      enum: [
        "one-time",
        "weekly",
        "twice a week",
        "monthly",
        "fourth night",
        "Quarterly",
        "3 Services Yearly",
      ],
      required: true,
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
  },
  {
    timestamps: true,
  }
);

serviceSchema.index({ jobNo: 1 }, { unique: true, sparse: true });

const Service = mongoose.model("Service", serviceSchema);

export default Service;
