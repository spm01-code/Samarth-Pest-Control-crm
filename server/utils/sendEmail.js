import { Resend } from "resend";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sendMail = async (email, otp, purpose = "REGISTRATION") => {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.error(`[Email Config Error] Operation: ${purpose} | RESEND_API_KEY environment variable is not configured`);
      throw new Error("RESEND_API_KEY must be set in environment variables");
    }

    let mailFrom = process.env.OTP_FROM_EMAIL;
    if (process.env.NODE_ENV === "production" && !mailFrom) {
      console.error(`[Email Config Error] Operation: ${purpose} | OTP_FROM_EMAIL environment variable is not configured in production`);
      throw new Error("OTP_FROM_EMAIL must be set in environment variables in production");
    }
    if (!mailFrom) {
      mailFrom = process.env.MAIL_FROM || "Samarth Pest Management <onboarding@resend.dev>";
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const currentYear = new Date().getFullYear();
    const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 5;

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

    const isPasswordChange = purpose === "PASSWORD_CHANGE";
    const subject = isPasswordChange
      ? "Password Change Verification Code - Samarth Pest Management"
      : "Verify Your Email Address - Samarth Pest Management";

    const titleText = isPasswordChange
      ? "Verify Password Change"
      : "Verify Your Email Address";

    const messageText = isPasswordChange
      ? "Please use the single-use verification code below to verify your password change request."
      : "Please use the single-use verification code below to complete your registration.";

    const securityWarningText = isPasswordChange
      ? "If you did not request this password change, you can safely ignore this email. Your password will remain unchanged."
      : "If you did not request this verification email, please secure your account credentials or ignore this email.";

    const plainTextBody = `${titleText}\n\n${messageText}\n\nYour Verification Code: ${otp}\n\nThis code will expire in ${expiryMinutes} minutes. For security reasons, please do not share this OTP with anyone.\n\n© ${currentYear} Samarth Pest Management. All rights reserved.`;

    const { data, error } = await resend.emails.send({
      from: mailFrom,
      to: [email],
      subject,
      text: plainTextBody,
      html: `
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
      `,
    });

    if (error) {
      const statusCode = error.statusCode || error.status || "N/A";
      const errorType = error.name || error.type || "ResendError";
      const errorMsg = error.message || "Unknown email service error";
      console.error(`[Email Provider Error] Operation: ${purpose} | Status: ${statusCode} | Type: ${errorType} | Details: ${errorMsg}`);
      
      const emailErr = new Error(errorMsg);
      emailErr.statusCode = statusCode;
      emailErr.type = errorType;
      throw emailErr;
    }

    console.log(`[Email Success] Operation: ${purpose} | Email ID: ${data?.id || "Sent"}`);
    return data;
  } catch (error) {
    if (!error.type && !error.message.includes("[Email")) {
      console.error(`[Email Failure] Operation: ${purpose} | Message: ${error.message || "Email sending failed"}`);
    }
    throw error;
  }
};

export default sendMail;

