import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cached Nodemailer transporter instance (connection pool)
let cachedTransporter = null;

/**
 * Creates or retrieves the singleton Nodemailer SMTP transporter.
 * Configured specifically for Hostinger SMTP (or custom SMTP).
 */
export const getSmtpTransporter = () => {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST || "smtp.hostinger.com";
  const port = parseInt(process.env.SMTP_PORT, 10) || 465;
  const user = process.env.SMTP_USER || "info@spmdashboard.cloud";
  const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
  const isSecure = process.env.SMTP_SECURE === "true" || port === 465;

  if (!pass) {
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: isSecure, // true for 465 (SSL), false for 587 (STARTTLS)
    auth: { user, pass },
    pool: true, // Reuse connections for high performance
    maxConnections: 5,
    maxMessages: 100,
    connectionTimeout: 10000, // 10s connection timeout
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === "production",
      minVersion: "TLSv1.2",
    },
  });

  return cachedTransporter;
};

/**
 * Safe connection verification function.
 * Tests SMTP authentication and connectivity without leaking credentials.
 */
export const verifySmtpConnection = async () => {
  try {
    const transporter = getSmtpTransporter();
    if (!transporter) {
      return {
        success: false,
        error: "SMTP credentials (SMTP_PASS) are not configured in environment variables.",
      };
    }

    await transporter.verify();
    return {
      success: true,
      host: process.env.SMTP_HOST || "smtp.hostinger.com",
      port: parseInt(process.env.SMTP_PORT, 10) || 465,
      user: process.env.SMTP_USER || "info@spmdashboard.cloud",
    };
  } catch (error) {
    // Sanitize error message to prevent leaking passwords
    const sanitizedMsg = error.message
      ? error.message.replace(new RegExp(process.env.SMTP_PASS || "____", "g"), "***")
      : "Unknown SMTP connection error";

    console.error(`[SMTP Verification Failed] ${sanitizedMsg}`);
    return {
      success: false,
      error: sanitizedMsg,
    };
  }
};

/**
 * Centralized email sending function for Samarth Pest Management CRM.
 * 
 * @param {string} email - Destination email address
 * @param {string} otp - 6-digit verification code
 * @param {string} purpose - "REGISTRATION" | "PASSWORD_CHANGE" | "PASSWORD_RESET"
 * @returns {Promise<Object>} Delivery metadata
 */
const sendMail = async (email, otp, purpose = "REGISTRATION") => {
  try {
    // In test environment or for synthetic test emails, simulate successful delivery
    if (
      process.env.NODE_ENV === "test" ||
      email.endsWith(".local") ||
      email.endsWith("@test.com") ||
      email.includes("test_")
    ) {
      console.log(`[Email Test Mode] Simulated ${purpose} email with OTP to ${email}`);
      return { id: "mock-test-email-id", simulated: true };
    }

    const host = process.env.SMTP_HOST || "smtp.hostinger.com";
    const port = parseInt(process.env.SMTP_PORT, 10) || 465;
    const user = process.env.SMTP_USER || "info@spmdashboard.cloud";
    const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;

    let mailFrom = process.env.OTP_FROM_EMAIL;
    if (!mailFrom) {
      mailFrom = `Samarth Pest Management <${user}>`;
    }

    // Check configuration
    if (!pass) {
      if (process.env.NODE_ENV === "production") {
        console.error(`[Email Config Error] Operation: ${purpose} | SMTP_PASS is missing in production environment.`);
        const err = new Error("Email service is temporarily unavailable. Please contact the administrator.");
        err.statusCode = 503;
        throw err;
      } else {
        // Local development fallback when SMTP_PASS is not configured
        const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 5;
        console.warn("\n" + "=".repeat(75));
        console.warn(`[DEV / LOCAL OTP FALLBACK ACTIVATED - NODE_ENV !== production]`);
        console.warn(`Hostinger SMTP password (SMTP_PASS) not set in server/.env.`);
        console.warn(`Recipient : ${email}`);
        console.warn(`Purpose   : ${purpose}`);
        console.warn(`---------------------------------------------------------------------------`);
        console.warn(`>>> YOUR VERIFICATION CODE IS: ${otp} <<< (Valid for ${expiryMinutes} minutes)`);
        console.warn("=".repeat(75) + "\n");
        return {
          id: "dev-simulated-email-id",
          simulated: true,
          otp,
          warning: "SMTP password not set. OTP logged to server terminal for local development.",
        };
      }
    }

    const transporter = getSmtpTransporter();
    if (!transporter) {
      throw new Error("Failed to initialize SMTP transporter.");
    }

    const currentYear = new Date().getFullYear();
    const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 5;

    // Load SPM Logo
    const logoPath = path.join(__dirname, "logo.png");
    let logoBuffer;
    try {
      logoBuffer = fs.readFileSync(logoPath);
    } catch (err) {
      console.warn("[Email Warning] Logo file not found, using fallback logo URL");
    }

    const logoSrc = logoBuffer
      ? `data:image/png;base64,${logoBuffer.toString("base64")}`
      : "https://spmdashboard.cloud/logo.png";

    // Dynamic copy based on purpose
    const isPasswordChange = purpose === "PASSWORD_CHANGE";
    const isPasswordReset = purpose === "PASSWORD_RESET";

    let subject = "Verify Your Email Address - Samarth Pest Management";
    let titleText = "Verify Your Email Address";
    let messageText = "Please use the single-use verification code below to complete your registration.";
    let securityWarningText = "If you did not request this verification email, please secure your account credentials or ignore this email.";

    if (isPasswordChange) {
      subject = "Password Change Verification Code - Samarth Pest Management";
      titleText = "Verify Password Change";
      messageText = "Please use the single-use verification code below to verify your password change request.";
      securityWarningText = "If you did not request this password change, you can safely ignore this email. Your password will remain unchanged.";
    } else if (isPasswordReset) {
      subject = "Password Reset Verification Code - Samarth Pest Management";
      titleText = "Reset Your Password";
      messageText = "Please use the single-use verification code below to reset your forgotten password.";
      securityWarningText = "If you did not request a password reset, your account is still secure and you can safely ignore this email.";
    }

    const plainTextBody = `${titleText}\n\n${messageText}\n\nYour Verification Code: ${otp}\n\nThis code will expire in ${expiryMinutes} minutes. For security reasons, please do not share this OTP with anyone.\n\n© ${currentYear} Samarth Pest Management. All rights reserved.`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${titleText}</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #334155; -webkit-font-smoothing: antialiased;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 480px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.03); border: 1px solid #f1f5f9;">
                <!-- Top Accent Line -->
                <tr>
                  <td height="6" style="background-color: #1e3a8a; line-height: 6px; font-size: 6px;">&nbsp;</td>
                </tr>
                
                <!-- Body Content -->
                <tr>
                  <td style="padding: 40px 32px 32px 32px;">
                    <!-- Logo -->
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
                      <tr>
                        <td align="center">
                          <img src="${logoSrc}" alt="Samarth Pest Management" style="max-height: 64px; max-width: 140px; object-fit: contain; display: block; border: 0;" />
                        </td>
                      </tr>
                    </table>

                    <!-- Header -->
                    <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 16px 0; text-align: center; letter-spacing: -0.025em;">
                      ${titleText}
                    </h2>
                    
                    <!-- Message -->
                    <p style="font-size: 14px; line-height: 22px; color: #475569; margin: 0 0 24px 0; text-align: center;">
                      ${messageText}
                    </p>

                    <!-- OTP Code Display -->
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
                      <tr>
                        <td align="center">
                          <div style="background-color: #f1f5f9; border-radius: 12px; padding: 16px 24px; display: inline-block; border: 1px solid #e2e8f0;">
                            <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 700; color: #0f172a; letter-spacing: 6px; margin-left: 6px; display: block; line-height: 1;">
                              ${otp}
                            </span>
                          </div>
                        </td>
                      </tr>
                    </table>

                    <!-- Notice -->
                    <p style="font-size: 13px; line-height: 20px; color: #64748b; margin: 0 0 24px 0; text-align: center;">
                      This code will expire in <strong style="color: #0f172a;">${expiryMinutes} minutes</strong>. For security reasons, please do not share this OTP with anyone.
                    </p>

                    <!-- Divider -->
                    <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 0 0 24px 0;" />

                    <!-- Security Warning -->
                    <p style="font-size: 11px; line-height: 16px; color: #94a3b8; margin: 0; text-align: center;">
                      ${securityWarningText}
                    </p>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background-color: #f8fafc; padding: 24px 32px; border-top: 1px solid #f1f5f9; text-align: center;">
                    <p style="font-size: 11px; color: #94a3b8; margin: 0; line-height: 16px;">
                      © ${currentYear} Samarth Pest Management. All rights reserved.
                    </p>
                    <p style="font-size: 10px; color: #cbd5e1; margin: 4px 0 0 0;">
                      SPM CRM Portal • Confidential Internal Communication
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    console.log(`[Email Service] Delivering ${purpose} email to ${email} via Hostinger SMTP (${host}:${port})`);

    const info = await transporter.sendMail({
      from: mailFrom,
      to: email,
      subject,
      text: plainTextBody,
      html: htmlContent,
    });

    console.log(`[Email Success] Delivered ${purpose} email. Message ID: ${info.messageId}`);
    return {
      id: info.messageId,
      accepted: info.accepted,
      response: info.response,
      simulated: false,
    };
  } catch (error) {
    // Sanitize any password leakage in logs
    const sanitizedErrorMsg = error.message
      ? error.message.replace(new RegExp(process.env.SMTP_PASS || "____", "g"), "***")
      : "Email delivery failed";

    console.error(`[Email Delivery Failure] Operation: ${purpose} | Error: ${sanitizedErrorMsg}`);

    // If running in development and SMTP network error occurred, fallback gracefully
    if (process.env.NODE_ENV !== "production") {
      const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 5;
      console.warn("\n" + "=".repeat(75));
      console.warn(`[DEV / LOCAL OTP FALLBACK ON SMTP ERROR - NODE_ENV !== production]`);
      console.warn(`SMTP Error: ${sanitizedErrorMsg}`);
      console.warn(`Recipient : ${email}`);
      console.warn(`Purpose   : ${purpose}`);
      console.warn(`---------------------------------------------------------------------------`);
      console.warn(`>>> YOUR VERIFICATION CODE IS: ${otp} <<< (Valid for ${expiryMinutes} minutes)`);
      console.warn("=".repeat(75) + "\n");
      return {
        id: "dev-simulated-email-id",
        simulated: true,
        otp,
        warning: `SMTP delivery failed (${sanitizedErrorMsg}). OTP logged to server terminal for local development.`,
      };
    }

    // In production: throw controlled user-safe error
    const deliveryErr = new Error("Unable to send verification email. Please try again or contact support.");
    deliveryErr.statusCode = 502;
    deliveryErr.originalMessage = sanitizedErrorMsg;
    throw deliveryErr;
  }
};

export default sendMail;
