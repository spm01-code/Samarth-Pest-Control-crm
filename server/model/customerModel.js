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
  },
  {
    timestamps: true,
  }
);

const Customer = mongoose.model("Customer", customerSchema);

export default Customer;