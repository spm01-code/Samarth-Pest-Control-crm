import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Admin from "../model/adminModel.js";
import sendMail from "../utils/sendEmail.js";
import generateOTP from "../utils/generateOTP.js";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../utils/generateTokens.js";

export const registerAdmin = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    const existingAdmin = await Admin.findOne({ email });

    if (existingAdmin) {
      return res.status(400).json({
        message: "Admin already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const otp = generateOTP();

    const admin = await Admin.create({
      name,
      email,
      phone,
      password: hashedPassword,
      otp,
      otpExpiry: Date.now() + 5 * 60 * 1000,
    });

    await sendMail(email, otp);

    res.status(201).json({
      message: "OTP sent successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

export const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res.status(404).json({
        message: "Admin not found",
      });
    }

    if (admin.otp !== otp) {
      return res.status(400).json({
        message: "Invalid OTP",
      });
    }

    if (admin.otpExpiry < Date.now()) {
      return res.status(400).json({
        message: "OTP expired",
      });
    }

    admin.isVerified = true;
    admin.otp = null;
    admin.otpExpiry = null;

    await admin.save();

    res.status(200).json({
      message: "Email verified successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: error,
    });
  }
};

export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email });

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
        const passwordOtp = generateOTP();

        admin.resetPasswordOtp = passwordOtp;
        admin.resetPasswordOtpExpiry = Date.now() + 5 * 60 * 1000;

        await admin.save();
        await sendMail(admin.email, passwordOtp);

        return res.status(200).json({
          message: "OTP sent to registered email. Verify OTP to update password",
        });
      }

      if (admin.resetPasswordOtp !== otp) {
        return res.status(400).json({
          message: "Invalid OTP",
        });
      }

      if (admin.resetPasswordOtpExpiry < Date.now()) {
        return res.status(400).json({
          message: "OTP expired",
        });
      }

      admin.password = await bcrypt.hash(password, 12);
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
