import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Admin from "../model/adminModel.js";
import sendMail from "../utils/sendEmail.js";
import generateOTP, { hashOTP, verifyOTPHash } from "../utils/generateOTP.js";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../utils/generateTokens.js";

const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 5;
const OTP_EXPIRY_MS = OTP_EXPIRY_MINUTES * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

// ==========================================
// REGISTRATION FLOW
// ==========================================

export const registerAdmin = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    const trimmedEmail = String(email).trim().toLowerCase();
    const existingAdmin = await Admin.findOne({ email: trimmedEmail });

    if (existingAdmin) {
      if (existingAdmin.isVerified) {
        return res.status(400).json({
          message: "An account with this email already exists",
        });
      }

      // Existing unverified admin: update details and issue a fresh OTP
      const hashedPassword = await bcrypt.hash(password, 12);
      const rawOtp = generateOTP();
      const hashedOtp = hashOTP(rawOtp);

      existingAdmin.name = name.trim();
      existingAdmin.phone = phone.trim();
      existingAdmin.password = hashedPassword;
      existingAdmin.otp = hashedOtp;
      existingAdmin.otpExpiry = new Date(Date.now() + OTP_EXPIRY_MS);
      existingAdmin.otpAttempts = 0;
      existingAdmin.lastOtpSentAt = new Date();

      await sendMail(trimmedEmail, rawOtp, "REGISTRATION");
      await existingAdmin.save();

      return res.status(200).json({
        message: "Verification code sent to your email",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const rawOtp = generateOTP();
    const hashedOtp = hashOTP(rawOtp);

    // Send email first to prevent saving records on Resend failure
    await sendMail(trimmedEmail, rawOtp, "REGISTRATION");

    await Admin.create({
      name: name.trim(),
      email: trimmedEmail,
      phone: phone.trim(),
      password: hashedPassword,
      otp: hashedOtp,
      otpExpiry: new Date(Date.now() + OTP_EXPIRY_MS),
      otpAttempts: 0,
      lastOtpSentAt: new Date(),
      isVerified: false,
    });

    res.status(201).json({
      message: "OTP sent successfully",
    });
  } catch (error) {
    console.error("Register Error:", error.message);
    res.status(500).json({
      message:
        error.message && error.message.includes("OTP_FROM_EMAIL")
          ? error.message
          : "Unable to send verification code. Please try again.",
    });
  }
};

export const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        message: "Email and verification code are required",
      });
    }

    const trimmedEmail = String(email).trim().toLowerCase();
    const cleanOtp = String(otp).trim();

    if (cleanOtp.length !== 6) {
      return res.status(400).json({
        message: "Verification code must be 6 digits",
      });
    }

    const admin = await Admin.findOne({ email: trimmedEmail });

    if (!admin) {
      return res.status(404).json({
        message: "Admin not found",
      });
    }

    if (admin.isVerified) {
      return res.status(400).json({
        message: "Email is already verified. Please login.",
      });
    }

    if (!admin.otp || !admin.otpExpiry) {
      return res.status(400).json({
        message: "No active verification code found. Please request a new one.",
      });
    }

    // Attempt limit check
    if (admin.otpAttempts >= MAX_OTP_ATTEMPTS) {
      admin.otp = null;
      admin.otpExpiry = null;
      admin.otpAttempts = 0;
      await admin.save();
      return res.status(400).json({
        message: "Too many failed attempts. Please request a new verification code.",
      });
    }

    // Expiration check
    if (new Date(admin.otpExpiry).getTime() < Date.now()) {
      admin.otp = null;
      admin.otpExpiry = null;
      admin.otpAttempts = 0;
      await admin.save();
      return res.status(400).json({
        message: "Verification code has expired.",
      });
    }

    // Timing-safe comparison of SHA-256 hash
    const isValid = verifyOTPHash(cleanOtp, admin.otp);

    if (!isValid) {
      admin.otpAttempts = (admin.otpAttempts || 0) + 1;
      if (admin.otpAttempts >= MAX_OTP_ATTEMPTS) {
        admin.otp = null;
        admin.otpExpiry = null;
        admin.otpAttempts = 0;
        await admin.save();
        return res.status(400).json({
          message: "Too many failed attempts. Please request a new verification code.",
        });
      }
      await admin.save();
      return res.status(400).json({
        message: "Invalid verification code.",
      });
    }

    // Successful verification
    admin.isVerified = true;
    admin.otp = null;
    admin.otpExpiry = null;
    admin.otpAttempts = 0;

    await admin.save();

    res.status(200).json({
      message: "Email verified successfully",
    });
  } catch (error) {
    console.error("Verify OTP Error:", error.message);
    res.status(500).json({
      message: "An error occurred during verification. Please try again.",
    });
  }
};

export const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    const trimmedEmail = String(email).trim().toLowerCase();
    const admin = await Admin.findOne({ email: trimmedEmail });

    if (!admin) {
      return res.status(404).json({
        message: "Admin not found",
      });
    }

    if (admin.isVerified) {
      return res.status(400).json({
        message: "Email is already verified. Please login.",
      });
    }

    // Cooldown check (60 seconds)
    if (
      admin.lastOtpSentAt &&
      Date.now() - new Date(admin.lastOtpSentAt).getTime() < RESEND_COOLDOWN_MS
    ) {
      const waitSeconds = Math.ceil(
        (RESEND_COOLDOWN_MS - (Date.now() - new Date(admin.lastOtpSentAt).getTime())) / 1000
      );
      return res.status(429).json({
        message: `Please wait ${waitSeconds} seconds before requesting a new code.`,
      });
    }

    const rawOtp = generateOTP();
    const hashedOtp = hashOTP(rawOtp);

    admin.otp = hashedOtp;
    admin.otpExpiry = new Date(Date.now() + OTP_EXPIRY_MS);
    admin.otpAttempts = 0;
    admin.lastOtpSentAt = new Date();

    await sendMail(trimmedEmail, rawOtp, "REGISTRATION");
    await admin.save();

    res.status(200).json({
      message: "Verification code sent successfully",
    });
  } catch (error) {
    console.error("Resend OTP Error:", error.message);
    res.status(500).json({
      message: "Unable to send verification code. Please try again.",
    });
  }
};

// ==========================================
// AUTHENTICATION / LOGIN FLOW
// ==========================================

export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const trimmedEmail = String(email || "").trim().toLowerCase();
    const admin = await Admin.findOne({ email: trimmedEmail });

    if (!admin) {
      return res.status(404).json({
        message: "Admin not found",
      });
    }

    if (!admin.isVerified) {
      return res.status(400).json({
        message: "Please verify your email",
      });
    }

    const isPasswordMatched = await bcrypt.compare(
      password,
      admin.password
    );

    if (!isPasswordMatched) {
      return res.status(400).json({
        message: "Invalid credentials",
      });
    }

    const accessToken = generateAccessToken(admin._id);
    const refreshToken = generateRefreshToken(admin._id);

    admin.refreshToken = refreshToken;
    await admin.save();

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });

    res.status(200).json({
      message: "Login successful",
      accessToken,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

export const refreshAdminToken = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        message: "Refresh token not found",
      });
    }

    const decoded = jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const admin = await Admin.findById(decoded.adminId);

    if (!admin || admin.refreshToken !== refreshToken) {
      return res.status(401).json({
        message: "Invalid refresh token",
      });
    }

    const accessToken = generateAccessToken(admin._id);

    res.status(200).json({
      message: "Token refreshed successfully",
      accessToken,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
      },
    });
  } catch (error) {
    res.status(401).json({
      message: "Invalid or expired refresh token",
    });
  }
};

// ==========================================
// OTP-PROTECTED PASSWORD CHANGE FLOW
// ==========================================

export const requestPasswordChangeOTP = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        message: "Current password, new password, and confirmation are required",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        message: "Passwords do not match.",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: "New password must be at least 6 characters long",
      });
    }

    // Strictly authenticate through token context
    const admin = await Admin.findById(req.admin._id);
    if (!admin) {
      return res.status(404).json({
        message: "Admin not found",
      });
    }

    // Verify current password
    const isCurrentMatched = await bcrypt.compare(currentPassword, admin.password);
    if (!isCurrentMatched) {
      return res.status(400).json({
        message: "Current password is incorrect.",
      });
    }

    // Reject if new password equals current password
    const isSamePassword = await bcrypt.compare(newPassword, admin.password);
    if (isSamePassword) {
      return res.status(400).json({
        message: "New password cannot be the same as current password.",
      });
    }

    // Cooldown check (60 seconds)
    if (
      admin.lastResetPasswordOtpSentAt &&
      Date.now() - new Date(admin.lastResetPasswordOtpSentAt).getTime() < RESEND_COOLDOWN_MS
    ) {
      const waitSeconds = Math.ceil(
        (RESEND_COOLDOWN_MS - (Date.now() - new Date(admin.lastResetPasswordOtpSentAt).getTime())) / 1000
      );
      return res.status(429).json({
        message: `Please wait ${waitSeconds} seconds before requesting a new code.`,
      });
    }

    // Pre-hash the validated new password and bind it to pendingPassword
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);
    const rawOtp = generateOTP();
    const hashedOtp = hashOTP(rawOtp);

    admin.pendingPassword = hashedNewPassword;
    admin.resetPasswordOtp = hashedOtp;
    admin.resetPasswordOtpExpiry = new Date(Date.now() + OTP_EXPIRY_MS);
    admin.resetPasswordOtpAttempts = 0;
    admin.lastResetPasswordOtpSentAt = new Date();

    // Send through Resend to authenticated user's registered email
    await sendMail(admin.email, rawOtp, "PASSWORD_CHANGE");
    await admin.save();

    res.status(200).json({
      message: "Verification code sent to your registered email address.",
      email: admin.email,
    });
  } catch (error) {
    console.error("Request Password Change OTP Error:", error.message);
    res.status(500).json({
      message: "Unable to send verification code. Please try again.",
    });
  }
};

export const verifyPasswordChange = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({
        message: "Verification code is required",
      });
    }

    const cleanOtp = String(otp).trim();
    if (cleanOtp.length !== 6) {
      return res.status(400).json({
        message: "Verification code must be 6 digits",
      });
    }

    // Strictly authenticate through token context
    const admin = await Admin.findById(req.admin._id);
    if (!admin) {
      return res.status(404).json({
        message: "Admin not found",
      });
    }

    if (!admin.resetPasswordOtp || !admin.resetPasswordOtpExpiry || !admin.pendingPassword) {
      return res.status(400).json({
        message: "No active password change request found. Please start again.",
      });
    }

    // Attempt limit check
    if (admin.resetPasswordOtpAttempts >= MAX_OTP_ATTEMPTS) {
      admin.resetPasswordOtp = null;
      admin.resetPasswordOtpExpiry = null;
      admin.resetPasswordOtpAttempts = 0;
      admin.pendingPassword = null;
      admin.lastResetPasswordOtpSentAt = null;
      await admin.save();
      return res.status(400).json({
        message: "Too many failed attempts. Please request a new verification code.",
      });
    }

    // Expiration check
    if (new Date(admin.resetPasswordOtpExpiry).getTime() < Date.now()) {
      admin.resetPasswordOtp = null;
      admin.resetPasswordOtpExpiry = null;
      admin.resetPasswordOtpAttempts = 0;
      admin.pendingPassword = null;
      admin.lastResetPasswordOtpSentAt = null;
      await admin.save();
      return res.status(400).json({
        message: "Verification code has expired.",
      });
    }

    // Verify OTP using timing-safe hash comparison
    const isValid = verifyOTPHash(cleanOtp, admin.resetPasswordOtp);

    if (!isValid) {
      admin.resetPasswordOtpAttempts = (admin.resetPasswordOtpAttempts || 0) + 1;
      if (admin.resetPasswordOtpAttempts >= MAX_OTP_ATTEMPTS) {
        admin.resetPasswordOtp = null;
        admin.resetPasswordOtpExpiry = null;
        admin.resetPasswordOtpAttempts = 0;
        admin.pendingPassword = null;
        admin.lastResetPasswordOtpSentAt = null;
        await admin.save();
        return res.status(400).json({
          message: "Too many failed attempts. Please request a new verification code.",
        });
      }
      await admin.save();
      return res.status(400).json({
        message: "Invalid verification code.",
      });
    }

    // Commit new password and clear the challenge state
    admin.password = admin.pendingPassword;
    admin.pendingPassword = null;
    admin.resetPasswordOtp = null;
    admin.resetPasswordOtpExpiry = null;
    admin.resetPasswordOtpAttempts = 0;
    admin.lastResetPasswordOtpSentAt = null;

    await admin.save();

    res.status(200).json({
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Verify Password Change Error:", error.message);
    res.status(500).json({
      message: "An error occurred while changing password. Please try again.",
    });
  }
};

// ==========================================
// LEGACY / COMPATIBILITY HANDLERS
// ==========================================

export const updateAdmin = async (req, res) => {
  try {
    const { name, email, phone, password, otp } = req.body;

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid admin id",
      });
    }

    const admin = await Admin.findById(req.params.id);

    if (!admin) {
      return res.status(404).json({
        message: "Admin not found",
      });
    }

    if (email && email !== admin.email) {
      const existingAdmin = await Admin.findOne({ email });

      if (existingAdmin) {
        return res.status(400).json({
          message: "Email already exists",
        });
      }
    }

    if (password) {
      if (!otp) {
        const rawOtp = generateOTP();
        const hashedOtp = hashOTP(rawOtp);

        admin.resetPasswordOtp = hashedOtp;
        admin.resetPasswordOtpExpiry = new Date(Date.now() + OTP_EXPIRY_MS);
        admin.pendingPassword = await bcrypt.hash(password, 12);

        await admin.save();
        await sendMail(admin.email, rawOtp, "PASSWORD_CHANGE");

        return res.status(200).json({
          message: "OTP sent to registered email. Verify OTP to update password",
        });
      }

      if (
        !admin.resetPasswordOtp ||
        !admin.resetPasswordOtpExpiry ||
        new Date(admin.resetPasswordOtpExpiry).getTime() < Date.now()
      ) {
        return res.status(400).json({
          message: "Verification code has expired.",
        });
      }

      const isValid = verifyOTPHash(otp, admin.resetPasswordOtp);
      if (!isValid) {
        return res.status(400).json({
          message: "Invalid verification code.",
        });
      }

      admin.password = admin.pendingPassword || (await bcrypt.hash(password, 12));
      admin.pendingPassword = null;
      admin.resetPasswordOtp = null;
      admin.resetPasswordOtpExpiry = null;
    }

    if (name) admin.name = name;
    if (email) admin.email = email;
    if (phone) admin.phone = phone;

    await admin.save();

    res.status(200).json({
      message: "Admin updated successfully",
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        phone: admin.phone,
        isVerified: admin.isVerified,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

export const deleteAdmin = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid admin id",
      });
    }

    const admin = await Admin.findByIdAndDelete(req.params.id);

    if (!admin) {
      return res.status(404).json({
        message: "Admin not found",
      });
    }

    res.status(200).json({
      message: "Admin deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};
