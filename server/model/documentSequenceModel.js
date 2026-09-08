import mongoose from "mongoose";

const documentSequenceSchema = new mongoose.Schema(
  {
    documentType: {
      type: String,
      required: true,
      enum: [
        "INVOICE",
        "PC_QUOTATION",
        "ATT_QUOTATION",
        "CONTRACT_RENEWAL",
        "ONE_TIME_JOB",
      ],
      trim: true,
    },
    year: {
      type: Number,
      required: true,
      min: 2000,
      max: 2099,
    },
    seq: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

documentSequenceSchema.index({ documentType: 1, year: 1 }, { unique: true });

const DocumentSequence = mongoose.model(
  "DocumentSequence",
  documentSequenceSchema
);

export default DocumentSequence;
