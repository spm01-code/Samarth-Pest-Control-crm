import mongoose from "mongoose";

const importAuditLogSchema = new mongoose.Schema(
  {
    batchId: {
      type: String,
      required: true,
      index: true,
    },
    entityType: {
      type: String,
      required: true,
      enum: ["Customer", "JobNumber", "Service", "Renewal", "Invoice", "Quotation"],
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: ["CREATED", "ENRICHED", "MODIFIED", "ROLLED_BACK", "RESTORED", "DELETED"],
    },
    beforeImage: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    afterImage: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    executedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    reason: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

importAuditLogSchema.index({ batchId: 1, entityType: 1 });

const ImportAuditLog = mongoose.model("ImportAuditLog", importAuditLogSchema);

export default ImportAuditLog;
