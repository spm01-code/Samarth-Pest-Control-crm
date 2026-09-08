import mongoose from "mongoose";

const importSessionSchema = new mongoose.Schema(
  {
    importSessionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    originalFileName: {
      type: String,
      required: true,
      trim: true,
    },
    filePath: {
      type: String,
      required: true,
      trim: true,
    },
    selectedSheet: {
      type: String,
      trim: true,
      default: "",
    },
    targetEntity: {
      type: String,
      enum: ["Customer", "Employee", "Service", "Invoice", "Quotation", "Renewal"],
      trim: true,
    },
    mappings: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    validationResults: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "validated", "committed"],
      default: "pending",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: false,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// TTL Index for automatic cleanup of abandoned import sessions (MongoDB checks periodically)
importSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const ImportSession = mongoose.model("ImportSession", importSessionSchema);

export default ImportSession;
