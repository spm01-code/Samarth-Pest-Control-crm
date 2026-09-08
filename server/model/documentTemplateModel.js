import mongoose from "mongoose";

const documentTemplateSchema = new mongoose.Schema(
  {
    documentType: {
      type: String,
      enum: [
        "invoice",
        "tax-invoice",
        "quotation",
        "contract-renewal",
        "att-quotation",
        "one-time-job",
      ],
      required: true,
    },

    templateName: {
      type: String,
      required: true,
      trim: true,
    },

    fileName: {
      type: String,
      required: true,
      trim: true,
    },

    filePath: {
      type: String,
      required: true,
      trim: true,
    },

    mimeType: {
      type: String,
      default:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("DocumentTemplate", documentTemplateSchema);
