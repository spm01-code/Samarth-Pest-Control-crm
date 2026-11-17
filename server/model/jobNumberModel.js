import mongoose from "mongoose";

const jobNumberSchema = new mongoose.Schema(
  {
    jobNo: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    prefix: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    sequence: {
      type: Number,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ["available", "assigned"],
      default: "available",
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
      index: true,
    },
    isLegacy: {
      type: Boolean,
      default: false,
      index: true,
    },
    assignmentHistory: [
      {
        action: {
          type: String,
          enum: ["assigned", "released", "restored", "imported", "manual_override", "vacant_registered"],
          required: true,
        },
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
        customerName: String,
        timestamp: { type: Date, default: Date.now },
        reason: String,
      },
    ],
    importMeta: {
      batchId: String,
      sourceSheet: String,
      sourceRow: Number,
    },
  },
  { timestamps: true }
);

jobNumberSchema.index({ prefix: 1, status: 1, isLegacy: 1, sequence: 1 });

const JobNumber = mongoose.model("JobNumber", jobNumberSchema);

export default JobNumber;
