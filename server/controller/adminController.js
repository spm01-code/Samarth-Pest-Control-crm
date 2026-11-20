import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Admin from "../model/adminModel.js";
import sendMail from "../utils/sendEmail.js";
import generateOTP, { hashOTP, verifyOTPHash } from "../utils/generateOTP.js";
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
} from "../utils/generateTokens.js";
import { checkIpRateLimit, resetIpRateLimit } from "../utils/rateLimiter.js";
import validatePasswordStrength from "../utils/passwordValidator.js";
import logAuditEvent from "../utils/auditLogger.js";

const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 5;
const OTP_EXPIRY_MS = OTP_EXPIRY_MINUTES * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout
const ABSOLUTE_SESSION_MAX_MS = 12 * 60 * 60 * 1000; // 12 hours absolute session

// Helper to sanitize user object for responses
const sanitizeUser = (user) => ({
  id: user._id,
  _id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role || "employee",
  isActive: user.isActive !== false,
  isVerified: user.isVerified === true,
  createdAt: user.createdAt,
});

// Helper for cookie options
const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: ABSOLUTE_SESSION_MAX_MS,
});

// ==========================================
// REGISTRATION FLOW (NORMAL / EMPLOYEE)
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
    const existingUser = await Admin.findOne({ email: trimmedEmail });

    if (existingUser) {
      if (existingUser.isVerified) {
        return res.status(400).json({
          message: "An account with this email already exists",
        });
      }

      // Existing unverified user: update details and issue a fresh OTP
      const hashedPassword = await bcrypt.hash(password, 12);
      const rawOtp = generateOTP();
      const hashedOtp = hashOTP(rawOtp);

      existingUser.name = name.trim();
      existingUser.phone = phone.trim();
      existingUser.password = hashedPassword;
      // Default role for normal registration is always employee
      existingUser.role = "employee";
      existingUser.otp = hashedOtp;
      existingUser.otpExpiry = new Date(Date.now() + OTP_EXPIRY_MS);
      existingUser.otpAttempts = 0;
      existingUser.lastOtpSentAt = new Date();

      const mailResult = await sendMail(trimmedEmail, rawOtp, "REGISTRATION");
      await existingUser.save();

      logAuditEvent({
        req,
        userId: existingUser._id,
        userEmail: trimmedEmail,
        userRole: "employee",
        action: "EMPLOYEE_REGISTRATION_OTP_RESENT",
        module: "AUTH",
        status: "SUCCESS",
      });

      return res.status(200).json({
        message: mailResult?.simulated
          ? "Verification code generated (check server console in dev mode)"
          : "Verification code sent to your email",
        ...(mailResult?.simulated && process.env.NODE_ENV !== "production" ? { devOtp: rawOtp } : {}),
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const rawOtp = generateOTP();
    const hashedOtp = hashOTP(rawOtp);

    // Send email via centralized Nodemailer service
    const mailResult = await sendMail(trimmedEmail, rawOtp, "REGISTRATION");

    // Force default role to "employee" - ignores any body-supplied role
    const newUser = await Admin.create({
      name: name.trim(),
      email: trimmedEmail,
      phone: phone.trim(),
      password: hashedPassword,
      role: "employee",
      isActive: true,
      otp: hashedOtp,
      otpExpiry: new Date(Date.now() + OTP_EXPIRY_MS),
      otpAttempts: 0,
      lastOtpSentAt: new Date(),
      isVerified: false,
    });

    logAuditEvent({
      req,
      userId: newUser._id,
      userEmail: trimmedEmail,
      userRole: "employee",
      action: "EMPLOYEE_REGISTERED",
      module: "AUTH",
      status: "SUCCESS",
    });

    res.status(201).json({
      message: mailResult?.simulated
        ? "Verification code generated (check server console in dev mode)"
        : "OTP sent successfully",
      ...(mailResult?.simulated && process.env.NODE_ENV !== "production" ? { devOtp: rawOtp } : {}),
    });
  } catch (error) {
    console.error(`[Register User Failure] ${error.message}`);
    const isSmtpOrConfigError =
      error.message &&
      (error.message.includes("SMTP") ||
        error.message.includes("OTP_FROM_EMAIL") ||
        error.message.includes("Email service"));
    const statusCode = error.statusCode && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    res.status(statusCode).json({
      message: isSmtpOrConfigError
        ? error.message
        : "Unable to send verification code. Please try again.",
    });
  }
};

// ==========================================
// SECRET ADMIN REGISTRATION
// ==========================================

export const registerSecretAdmin = async (req, res) => {
  try {
    const { secretPath } = req.params;
    const configuredSecret = process.env.ADMIN_SECRET_PATH;

    // Check secret path parameter
    if (!configuredSecret || secretPath !== configuredSecret) {
      return res.status(404).json({
        message: "Route not found",
      });
    }

    // Check if admin registration is enabled
    if (process.env.ADMIN_REGISTRATION_ENABLED === "false") {
      return res.status(403).json({
        message: "Admin bootstrap registration has been disabled",
      });
    }

    // Validate Bootstrap Secret
    const providedBootstrap =
      req.headers["x-admin-bootstrap-secret"] || req.body.bootstrapSecret;
    const expectedBootstrap = process.env.ADMIN_BOOTSTRAP_SECRET;

    if (
      !expectedBootstrap ||
      !providedBootstrap ||
      String(providedBootstrap).trim() !== String(expectedBootstrap).trim()
    ) {
      logAuditEvent({
        req,
        action: "ADMIN_BOOTSTRAP_INVALID_SECRET",
        module: "AUTH",
        status: "BLOCKED",
      });
      return res.status(403).json({
        message: "Invalid or missing Admin bootstrap secret",
      });
    }

    const { name, email, phone, password } = req.body;
    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    // Enforce strong password complexity for Admin
    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.isValid) {
      return res.status(400).json({
        message: passwordCheck.message,
      });
    }

    const trimmedEmail = String(email).trim().toLowerCase();
    const existingUser = await Admin.findOne({ email: trimmedEmail });

    if (existingUser) {
      if (existingUser.isVerified) {
        return res.status(400).json({
          message: "An account with this email already exists",
        });
      }

      const hashedPassword = await bcrypt.hash(password, 12);
      const rawOtp = generateOTP();
      const hashedOtp = hashOTP(rawOtp);

      existingUser.name = name.trim();
      existingUser.phone = phone.trim();
      existingUser.password = hashedPassword;
      existingUser.role = "admin";
      existingUser.otp = hashedOtp;
      existingUser.otpExpiry = new Date(Date.now() + OTP_EXPIRY_MS);
      existingUser.otpAttempts = 0;
      existingUser.lastOtpSentAt = new Date();

      const mailResult = await sendMail(trimmedEmail, rawOtp, "REGISTRATION");
      await existingUser.save();

      logAuditEvent({
        req,
        userId: existingUser._id,
        userEmail: trimmedEmail,
        userRole: "admin",
        action: "ADMIN_BOOTSTRAP_OTP_RESENT",
        module: "AUTH",
        status: "SUCCESS",
      });

      return res.status(200).json({
        message: mailResult?.simulated
          ? "Admin verification code generated (check server console in dev mode)"
          : "Admin verification code sent to your email",
        ...(mailResult?.simulated && process.env.NODE_ENV !== "production" ? { devOtp: rawOtp } : {}),
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const rawOtp = generateOTP();
    const hashedOtp = hashOTP(rawOtp);

    const mailResult = await sendMail(trimmedEmail, rawOtp, "REGISTRATION");

    const newAdmin = await Admin.create({
      name: name.trim(),
      email: trimmedEmail,
      phone: phone.trim(),
      password: hashedPassword,
      role: "admin",
      isActive: true,
      otp: hashedOtp,
      otpExpiry: new Date(Date.now() + OTP_EXPIRY_MS),
      otpAttempts: 0,
      lastOtpSentAt: new Date(),
      isVerified: false,
    });

    logAuditEvent({
      req,
      userId: newAdmin._id,
      userEmail: trimmedEmail,
      userRole: "admin",
      action: "ADMIN_BOOTSTRAP_REGISTERED",
      module: "AUTH",
      status: "SUCCESS",
    });

    return res.status(201).json({
      message: mailResult?.simulated
        ? "Admin verification code generated (check server console in dev mode)"
        : "Admin account registered. Verification code sent to email.",
      ...(mailResult?.simulated && process.env.NODE_ENV !== "production" ? { devOtp: rawOtp } : {}),
    });
  } catch (error) {
    console.error(`[Register Secret Admin Failure] ${error.message}`);
    const isSmtpOrConfigError =
      error.message &&
      (error.message.includes("SMTP") ||
        error.message.includes("OTP_FROM_EMAIL") ||
        error.message.includes("Email service"));
    const statusCode = error.statusCode && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    res.status(statusCode).json({
      message: isSmtpOrConfigError
        ? error.message
        : "An error occurred during admin registration.",
    });
  }
};

// ==========================================
// OTP VERIFICATION FLOW
// ==========================================

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

    const user = await Admin.findOne({ email: trimmedEmail });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        message: "Email is already verified. Please login.",
      });
    }

    if (!user.otp || !user.otpExpiry) {
      return res.status(400).json({
        message: "No active verification code found. Please request a new one.",
      });
    }

    // Attempt limit check
    if (user.otpAttempts >= MAX_OTP_ATTEMPTS) {
      user.otp = null;
      user.otpExpiry = null;
      user.otpAttempts = 0;
      await user.save();
      return res.status(400).json({
        message: "Too many failed attempts. Please request a new verification code.",
      });
    }

    // Expiration check
    if (new Date(user.otpExpiry).getTime() < Date.now()) {
      user.otp = null;
      user.otpExpiry = null;
      user.otpAttempts = 0;
      await user.save();
      return res.status(400).json({
        message: "Verification code has expired.",
      });
    }

    // Timing-safe comparison of SHA-256 hash
    const isValid = verifyOTPHash(cleanOtp, user.otp);

    if (!isValid) {
      user.otpAttempts = (user.otpAttempts || 0) + 1;
      if (user.otpAttempts >= MAX_OTP_ATTEMPTS) {
        user.otp = null;
        user.otpExpiry = null;
        user.otpAttempts = 0;
        await user.save();
        return res.status(400).json({
          message: "Too many failed attempts. Please request a new verification code.",
        });
      }
      await user.save();
      return res.status(400).json({
        message: "Invalid verification code.",
      });
    }

    // Successful verification
    user.isVerified = true;
    user.otp = null;
    user.otpExpiry = null;
    user.otpAttempts = 0;

    await user.save();

    logAuditEvent({
      req,
      userId: user._id,
      userEmail: user.email,
      userRole: user.role,
      action: "EMAIL_VERIFIED",
      module: "AUTH",
      status: "SUCCESS",
    });

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
    const user = await Admin.findOne({ email: trimmedEmail });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        message: "Email is already verified. Please login.",
      });
    }

    // Cooldown check (60 seconds)
    if (
      user.lastOtpSentAt &&
      Date.now() - new Date(user.lastOtpSentAt).getTime() < RESEND_COOLDOWN_MS
    ) {
      const waitSeconds = Math.ceil(
        (RESEND_COOLDOWN_MS - (Date.now() - new Date(user.lastOtpSentAt).getTime())) / 1000
      );
      return res.status(429).json({
        message: `Please wait ${waitSeconds} seconds before requesting a new code.`,
      });
    }

    const rawOtp = generateOTP();
    const hashedOtp = hashOTP(rawOtp);

    user.otp = hashedOtp;
    user.otpExpiry = new Date(Date.now() + OTP_EXPIRY_MS);
    user.otpAttempts = 0;
    user.lastOtpSentAt = new Date();

    const mailResult = await sendMail(trimmedEmail, rawOtp, "REGISTRATION");
    await user.save();

    res.status(200).json({
      message: mailResult?.simulated
        ? "Verification code generated (check server console in dev mode)"
        : "Verification code sent successfully",
      ...(mailResult?.simulated && process.env.NODE_ENV !== "production" ? { devOtp: rawOtp } : {}),
    });
  } catch (error) {
    console.error(`[Resend OTP Failure] ${error.message}`);
    const isSmtpOrConfigError =
      error.message &&
      (error.message.includes("SMTP") ||
        error.message.includes("OTP_FROM_EMAIL") ||
        error.message.includes("Email service"));
    const statusCode = error.statusCode && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    res.status(statusCode).json({
      message: isSmtpOrConfigError
        ? error.message
        : "Unable to send verification code. Please try again.",
    });
  }
};

// ==========================================
// NORMAL LOGIN FLOW
// ==========================================

export const loginAdmin = async (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || req.ip || "unknown";

  try {
    // Check IP rate limit
    const ipCheck = checkIpRateLimit(ip, false);
    if (!ipCheck.isAllowed) {
      logAuditEvent({
        req,
        action: "LOGIN_RATE_LIMIT_EXCEEDED",
        module: "AUTH",
        status: "BLOCKED",
      });
      return res.status(429).json({
        message: ipCheck.message,
      });
    }

    const { email, password } = req.body;
    const trimmedEmail = String(email || "").trim().toLowerCase();

    if (!trimmedEmail || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const user = await Admin.findOne({ email: trimmedEmail });

    // Consistent timing / generic message to avoid revealing account existence
    if (!user) {
      logAuditEvent({
        req,
        userEmail: trimmedEmail,
        action: "LOGIN_FAILED_USER_NOT_FOUND",
        module: "AUTH",
        status: "FAILURE",
      });
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    // Check account lockout
    if (user.lockoutUntil && new Date(user.lockoutUntil).getTime() > Date.now()) {
      const waitMinutes = Math.ceil(
        (new Date(user.lockoutUntil).getTime() - Date.now()) / (60 * 1000)
      );
      logAuditEvent({
        req,
        userId: user._id,
        userEmail: user.email,
        userRole: user.role,
        action: "LOGIN_BLOCKED_ACCOUNT_LOCKED",
        module: "AUTH",
        status: "BLOCKED",
      });
      return res.status(429).json({
        message: `Account is temporarily locked due to multiple failed login attempts. Please try again in ${waitMinutes} minute(s).`,
      });
    }

    if (!user.isVerified) {
      return res.status(400).json({
        message: "Please verify your email",
      });
    }

    // Check if account is active
    if (user.isActive === false) {
      logAuditEvent({
        req,
        userId: user._id,
        userEmail: user.email,
        userRole: user.role,
        action: "LOGIN_BLOCKED_INACTIVE_ACCOUNT",
        module: "AUTH",
        status: "BLOCKED",
      });
      return res.status(403).json({
        message: "Your account has been deactivated. Please contact an administrator.",
      });
    }

    const isPasswordMatched = await bcrypt.compare(password, user.password);

    if (!isPasswordMatched) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

      if (user.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
        user.lockoutUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        user.failedLoginAttempts = 0;
        await user.save();

        logAuditEvent({
          req,
          userId: user._id,
          userEmail: user.email,
          userRole: user.role,
          action: "ACCOUNT_LOCKED_FAILED_LOGINS",
          module: "AUTH",
          status: "FAILURE",
        });

        return res.status(429).json({
          message: "Too many failed login attempts. Account temporarily locked for 15 minutes.",
        });
      }

      await user.save();

      logAuditEvent({
        req,
        userId: user._id,
        userEmail: user.email,
        userRole: user.role,
        action: "LOGIN_FAILED_INVALID_PASSWORD",
        module: "AUTH",
        status: "FAILURE",
      });

      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    // Successful Login
    user.failedLoginAttempts = 0;
    user.lockoutUntil = null;
    resetIpRateLimit(ip, false);

    // Set absolute 12-hour session expiry
    user.sessionExpiresAt = new Date(Date.now() + ABSOLUTE_SESSION_MAX_MS);

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    user.refreshTokenHash = hashToken(refreshToken);
    await user.save();

    res.cookie("refreshToken", refreshToken, getCookieOptions());

    logAuditEvent({
      req,
      userId: user._id,
      userEmail: user.email,
      userRole: user.role,
      action: "LOGIN_SUCCESS",
      module: "AUTH",
      status: "SUCCESS",
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      accessToken,
      admin: sanitizeUser(user),
    });
  } catch (error) {
    console.error(`[Login Error]: ${error.message}`);
    res.status(500).json({
      message: error.message || "An error occurred during login",
    });
  }
};

// ==========================================
// SECRET ADMIN LOGIN
// ==========================================

export const loginSecretAdmin = async (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || req.ip || "unknown";

  try {
    const { secretPath } = req.params;
    const configuredSecret = process.env.ADMIN_SECRET_PATH;

    // Check secret path parameter - return 404 if invalid
    if (!configuredSecret || secretPath !== configuredSecret) {
      return res.status(404).json({
        message: "Route not found",
      });
    }

    // Apply stricter admin IP rate limit
    const ipCheck = checkIpRateLimit(ip, true);
    if (!ipCheck.isAllowed) {
      logAuditEvent({
        req,
        action: "ADMIN_LOGIN_RATE_LIMIT_EXCEEDED",
        module: "AUTH",
        status: "BLOCKED",
      });
      return res.status(429).json({
        message: ipCheck.message,
      });
    }

    const { email, password } = req.body;
    const trimmedEmail = String(email || "").trim().toLowerCase();

    if (!trimmedEmail || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const user = await Admin.findOne({ email: trimmedEmail });

    if (!user) {
      logAuditEvent({
        req,
        userEmail: trimmedEmail,
        action: "ADMIN_LOGIN_FAILED_USER_NOT_FOUND",
        module: "AUTH",
        status: "FAILURE",
      });
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    // Check account lockout
    if (user.lockoutUntil && new Date(user.lockoutUntil).getTime() > Date.now()) {
      return res.status(429).json({
        message: "Account is temporarily locked due to multiple failed login attempts. Please try again later.",
      });
    }

    if (!user.isVerified) {
      return res.status(400).json({
        message: "Please verify your email",
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        message: "Account has been deactivated. Please contact an administrator.",
      });
    }

    // STRICT CHECK: Employee accounts must NEVER authenticate through Admin login
    if (user.role !== "admin") {
      logAuditEvent({
        req,
        userId: user._id,
        userEmail: user.email,
        userRole: user.role,
        action: "EMPLOYEE_ATTEMPTED_ADMIN_LOGIN",
        module: "AUTH",
        status: "BLOCKED",
      });
      return res.status(403).json({
        message: "Access denied: Not an administrator account",
      });
    }

    const isPasswordMatched = await bcrypt.compare(password, user.password);

    if (!isPasswordMatched) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

      if (user.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
        user.lockoutUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        user.failedLoginAttempts = 0;
        await user.save();
        return res.status(429).json({
          message: "Too many failed login attempts. Account temporarily locked for 15 minutes.",
        });
      }

      await user.save();
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    // Successful Admin Login
    user.failedLoginAttempts = 0;
    user.lockoutUntil = null;
    resetIpRateLimit(ip, true);

    user.sessionExpiresAt = new Date(Date.now() + ABSOLUTE_SESSION_MAX_MS);

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    user.refreshTokenHash = hashToken(refreshToken);
    await user.save();

    res.cookie("refreshToken", refreshToken, getCookieOptions());

    logAuditEvent({
      req,
      userId: user._id,
      userEmail: user.email,
      userRole: "admin",
      action: "ADMIN_LOGIN_SUCCESS",
      module: "AUTH",
      status: "SUCCESS",
    });

    res.status(200).json({
      success: true,
      message: "Admin login successful",
      accessToken,
      admin: sanitizeUser(user),
    });
  } catch (error) {
    console.error(`[Admin Login Error]: ${error.message}`);
    res.status(500).json({
      message: error.message || "An error occurred during admin login",
    });
  }
};

// ==========================================
// TOKEN REFRESH FLOW WITH ROTATION & REUSE DETECTION
// ==========================================

export const refreshAdminToken = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token not found",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    } catch (err) {
      res.clearCookie("refreshToken");
      return res.status(401).json({
        success: false,
        message: "Invalid or expired refresh token",
      });
    }

    const userId = decoded.adminId || decoded.id;
    const user = await Admin.findById(userId);

    if (!user) {
      res.clearCookie("refreshToken");
      return res.status(401).json({
        success: false,
        message: "User account not found",
      });
    }

    if (user.isActive === false) {
      res.clearCookie("refreshToken");
      return res.status(403).json({
        success: false,
        message: "Account deactivated",
      });
    }

    // Check tokenVersion for revocation
    if (
      decoded.tokenVersion !== undefined &&
      user.tokenVersion !== undefined &&
      decoded.tokenVersion !== user.tokenVersion
    ) {
      res.clearCookie("refreshToken");
      return res.status(401).json({
        success: false,
        message: "Session has been invalidated. Please log in again.",
      });
    }

    // Check absolute 12-hour session expiry
    if (user.sessionExpiresAt && Date.now() > new Date(user.sessionExpiresAt).getTime()) {
      user.refreshTokenHash = null;
      user.refreshToken = null;
      await user.save();
      res.clearCookie("refreshToken");

      logAuditEvent({
        req,
        userId: user._id,
        userEmail: user.email,
        userRole: user.role,
        action: "SESSION_MAX_DURATION_EXCEEDED",
        module: "AUTH",
        status: "BLOCKED",
      });

      return res.status(401).json({
        success: false,
        message: "Maximum session duration (12 hours) reached. Please log in again.",
      });
    }

    // Token reuse detection: verify incoming token against stored hash
    const incomingHash = hashToken(refreshToken);
    if (!user.refreshTokenHash || user.refreshTokenHash !== incomingHash) {
      // Possible token reuse attack detected! Invalidate all user sessions
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      user.refreshTokenHash = null;
      user.refreshToken = null;
      await user.save();
      res.clearCookie("refreshToken");

      logAuditEvent({
        req,
        userId: user._id,
        userEmail: user.email,
        userRole: user.role,
        action: "TOKEN_REUSE_DETECTED",
        module: "AUTH",
        status: "BLOCKED",
      });

      return res.status(401).json({
        success: false,
        message: "Security warning: Token reuse detected. All sessions terminated.",
      });
    }

    // Issue rotated tokens
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    user.refreshToken = newRefreshToken;
    user.refreshTokenHash = hashToken(newRefreshToken);
    await user.save();

    res.cookie("refreshToken", newRefreshToken, getCookieOptions());

    res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      accessToken: newAccessToken,
      admin: sanitizeUser(user),
    });
  } catch (error) {
    res.clearCookie("refreshToken");
    res.status(401).json({
      success: false,
      message: error.message || "Invalid or expired refresh token",
    });
  }
};

// ==========================================
// LOGOUT
// ==========================================

export const logoutUser = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    let userId = req.user?._id || req.admin?._id;

    if (!userId && refreshToken) {
      try {
        const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
        userId = decoded.adminId || decoded.id;
      } catch (e) {}
    }

    if (userId) {
      const user = await Admin.findById(userId);
      if (user) {
        user.refreshTokenHash = null;
        user.refreshToken = null;
        await user.save();

        logAuditEvent({
          req,
          userId: user._id,
          userEmail: user.email,
          userRole: user.role,
          action: "LOGOUT_SUCCESS",
          module: "AUTH",
          status: "SUCCESS",
        });
      }
    }

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    res.clearCookie("refreshToken");
    return res.status(200).json({
      success: true,
      message: "Logged out",
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

    // Enforce password strength
    const passwordCheck = validatePasswordStrength(newPassword);
    if (!passwordCheck.isValid) {
      return res.status(400).json({
        message: passwordCheck.message,
      });
    }

    const user = await Admin.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Verify current password
    const isCurrentMatched = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentMatched) {
      return res.status(400).json({
        message: "Current password is incorrect.",
      });
    }

    // Reject if new password equals current password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({
        message: "New password cannot be the same as current password.",
      });
    }

    // Cooldown check (60 seconds)
    if (
      user.lastResetPasswordOtpSentAt &&
      Date.now() - new Date(user.lastResetPasswordOtpSentAt).getTime() < RESEND_COOLDOWN_MS
    ) {
      const waitSeconds = Math.ceil(
        (RESEND_COOLDOWN_MS - (Date.now() - new Date(user.lastResetPasswordOtpSentAt).getTime())) / 1000
      );
      return res.status(429).json({
        message: `Please wait ${waitSeconds} seconds before requesting a new code.`,
      });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 12);
    const rawOtp = generateOTP();
    const hashedOtp = hashOTP(rawOtp);

    user.pendingPassword = hashedNewPassword;
    user.resetPasswordOtp = hashedOtp;
    user.resetPasswordOtpExpiry = new Date(Date.now() + OTP_EXPIRY_MS);
    user.resetPasswordOtpAttempts = 0;
    user.lastResetPasswordOtpSentAt = new Date();

    await sendMail(user.email, rawOtp, "PASSWORD_CHANGE");
    await user.save();

    res.status(200).json({
      message: "Verification code sent to your registered email address.",
      email: user.email,
    });
  } catch (error) {
    console.error(`[Request Password Change OTP Failure] ${error.message}`);
    const isSmtpOrConfigError =
      error.message &&
      (error.message.includes("SMTP") ||
        error.message.includes("OTP_FROM_EMAIL") ||
        error.message.includes("Email service"));
    const statusCode = error.statusCode && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    res.status(statusCode).json({
      message: isSmtpOrConfigError
        ? error.message
        : "Unable to send verification code. Please try again.",
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

    const user = await Admin.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (!user.resetPasswordOtp || !user.resetPasswordOtpExpiry || !user.pendingPassword) {
      return res.status(400).json({
        message: "No active password change request found. Please start again.",
      });
    }

    if (user.resetPasswordOtpAttempts >= MAX_OTP_ATTEMPTS) {
      user.resetPasswordOtp = null;
      user.resetPasswordOtpExpiry = null;
      user.resetPasswordOtpAttempts = 0;
      user.pendingPassword = null;
      user.lastResetPasswordOtpSentAt = null;
      await user.save();
      return res.status(400).json({
        message: "Too many failed attempts. Please request a new verification code.",
      });
    }

    if (new Date(user.resetPasswordOtpExpiry).getTime() < Date.now()) {
      user.resetPasswordOtp = null;
      user.resetPasswordOtpExpiry = null;
      user.resetPasswordOtpAttempts = 0;
      user.pendingPassword = null;
      user.lastResetPasswordOtpSentAt = null;
      await user.save();
      return res.status(400).json({
        message: "Verification code has expired.",
      });
    }

    const isValid = verifyOTPHash(cleanOtp, user.resetPasswordOtp);

    if (!isValid) {
      user.resetPasswordOtpAttempts = (user.resetPasswordOtpAttempts || 0) + 1;
      if (user.resetPasswordOtpAttempts >= MAX_OTP_ATTEMPTS) {
        user.resetPasswordOtp = null;
        user.resetPasswordOtpExpiry = null;
        user.resetPasswordOtpAttempts = 0;
        user.pendingPassword = null;
        user.lastResetPasswordOtpSentAt = null;
        await user.save();
        return res.status(400).json({
          message: "Too many failed attempts. Please request a new verification code.",
        });
      }
      await user.save();
      return res.status(400).json({
        message: "Invalid verification code.",
      });
    }

    // Commit new password, increment tokenVersion to invalidate other active sessions
    user.password = user.pendingPassword;
    user.pendingPassword = null;
    user.resetPasswordOtp = null;
    user.resetPasswordOtpExpiry = null;
    user.resetPasswordOtpAttempts = 0;
    user.lastResetPasswordOtpSentAt = null;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.refreshTokenHash = null;

    await user.save();

    logAuditEvent({
      req,
      userId: user._id,
      userEmail: user.email,
      userRole: user.role,
      action: "PASSWORD_CHANGED",
      module: "AUTH",
      status: "SUCCESS",
    });

    res.status(200).json({
      message: "Password changed successfully. Please log in with your new password.",
    });
  } catch (error) {
    console.error("Verify Password Change Error:", error.message);
    res.status(500).json({
      message: "An error occurred while changing password. Please try again.",
    });
  }
};

// ==========================================
// ADMIN USER MANAGEMENT ENDPOINTS
// ==========================================

export const getAllUsers = async (req, res) => {
  try {
    const users = await Admin.find()
      .select("-password -otp -resetPasswordOtp -pendingPassword -refreshToken -refreshTokenHash")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      users: users.map(sanitizeUser),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    if (!["admin", "employee"].includes(role)) {
      return res.status(400).json({
        message: "Role must be 'admin' or 'employee'",
      });
    }

    const targetUser = await Admin.findById(id);
    if (!targetUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Prevent demoting the last active Admin
    if (targetUser.role === "admin" && role === "employee") {
      const activeAdminCount = await Admin.countDocuments({
        role: "admin",
        isActive: { $ne: false },
      });

      if (activeAdminCount <= 1) {
        return res.status(400).json({
          message: "Cannot demote the last active Administrator account",
        });
      }
    }

    const oldRole = targetUser.role;
    targetUser.role = role;
    // Invalidate target user's active tokens immediately
    targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
    targetUser.refreshTokenHash = null;

    await targetUser.save();

    logAuditEvent({
      req,
      userId: req.user._id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: "ROLE_CHANGED",
      module: "USER_MANAGEMENT",
      targetId: String(targetUser._id),
      details: {
        targetEmail: targetUser.email,
        oldRole,
        newRole: role,
      },
      status: "SUCCESS",
    });

    res.status(200).json({
      success: true,
      message: `User role updated to ${role} successfully`,
      user: sanitizeUser(targetUser),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    const targetUser = await Admin.findById(id);
    if (!targetUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Prevent deactivating the last active Admin
    if (targetUser.role === "admin" && isActive === false) {
      const activeAdminCount = await Admin.countDocuments({
        role: "admin",
        isActive: { $ne: false },
      });

      if (activeAdminCount <= 1) {
        return res.status(400).json({
          message: "Cannot deactivate the last active Administrator account",
        });
      }
    }

    targetUser.isActive = Boolean(isActive);
    targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
    targetUser.refreshTokenHash = null;

    await targetUser.save();

    logAuditEvent({
      req,
      userId: req.user._id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: "USER_STATUS_CHANGED",
      module: "USER_MANAGEMENT",
      targetId: String(targetUser._id),
      details: {
        targetEmail: targetUser.email,
        isActive: targetUser.isActive,
      },
      status: "SUCCESS",
    });

    res.status(200).json({
      success: true,
      message: `User ${targetUser.isActive ? "activated" : "deactivated"} successfully`,
      user: sanitizeUser(targetUser),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getAuditLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;

    const AuditLog = (await import("../model/auditLogModel.js")).default;
    const [logs, total] = await Promise.all([
      AuditLog.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      AuditLog.countDocuments(),
    ]);

    res.status(200).json({
      success: true,
      logs,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================================
// LEGACY / COMPATIBILITY HANDLERS
// ==========================================

export const updateAdmin = async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid admin id",
      });
    }

    const user = await Admin.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (email && email !== user.email) {
      const existingUser = await Admin.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          message: "Email already exists",
        });
      }
    }

    if (name) user.name = name;
    if (email) user.email = email;
    if (phone) user.phone = phone;

    await user.save();

    logAuditEvent({
      req,
      userId: req.user._id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: "USER_UPDATED",
      module: "USER_MANAGEMENT",
      targetId: String(user._id),
      status: "SUCCESS",
    });

    res.status(200).json({
      message: "User updated successfully",
      admin: sanitizeUser(user),
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
        message: "Invalid user id",
      });
    }

    const targetUser = await Admin.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Prevent deleting the last active Administrator
    if (targetUser.role === "admin") {
      const activeAdminCount = await Admin.countDocuments({
        role: "admin",
        isActive: { $ne: false },
      });

      if (activeAdminCount <= 1) {
        return res.status(400).json({
          message: "Cannot delete the last active Administrator account",
        });
      }
    }

    await Admin.findByIdAndDelete(req.params.id);

    logAuditEvent({
      req,
      userId: req.user._id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: "USER_DELETED",
      module: "USER_MANAGEMENT",
      targetId: req.params.id,
      status: "SUCCESS",
    });

    res.status(200).json({
      message: "User deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};
