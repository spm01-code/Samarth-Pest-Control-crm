import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    customerType: {
      type: String,
      enum: ["residential", "commercial"],
      required: true,
    },

    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    jobNo: {
      type: String,
      trim: true,
      index: true,
    },

    companyName: {
      type: String,
      trim: true,
    },

    phone: {
      type: String,
      required: false,
      sparse: true,
      unique: true,
      trim: true,
    },

    alternatePhone: {
      type: String,
      trim: true,
    },

    email: {
      type: String,
      lowercase: true,
      trim: true,
    },

    address: {
      type: String,
      required: true,
      trim: true,
    },

    contactPerson: {
      type: String,
      trim: true,
    },

    gstNumber: {
      type: String,
      trim: true,
    },

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },

    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },

    archivedJobNo: {
      type: String,
      trim: true,
    },

    archivedAt: {
      type: Date,
    },

    importMeta: {
      batchId: { type: String, index: true },
      sourceSheet: { type: String, trim: true },
      sourceRows: [{ type: Number }],
      sourceJobNo: { type: String, trim: true },
      importedAt: { type: Date },
    },
  },
  {
    timestamps: true,
  }
);

const Customer = mongoose.model("Customer", customerSchema);

export default Customer;