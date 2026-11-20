import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
    },

    password: {
      type: String,
      required: true,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    otp: {
      type: String,
    },

    otpExpiry: {
      type: Date,
    },

    otpAttempts: {
      type: Number,
      default: 0,
    },

    lastOtpSentAt: {
      type: Date,
    },

    resetPasswordOtp: {
      type: String,
    },

    resetPasswordOtpExpiry: {
      type: Date,
    },

    resetPasswordOtpAttempts: {
      type: Number,
      default: 0,
    },

    lastResetPasswordOtpSentAt: {
      type: Date,
    },

    pendingPassword: {
      type: String,
    },

    refreshToken: {
      type: String,
    },

    refreshTokenHash: {
      type: String,
      default: null,
    },

    sessionExpiresAt: {
      type: Date,
      default: null,
    },

    tokenVersion: {
      type: Number,
      default: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    failedLoginAttempts: {
      type: Number,
      default: 0,
    },

    lockoutUntil: {
      type: Date,
      default: null,
    },

    role: {
      type: String,
      enum: ["admin", "employee"],
      default: "employee",
      lowercase: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const Admin = mongoose.model("Admin", adminSchema);

export { Admin as User };
export default Admin;