import { Resend } from "resend";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sendMail = async (email, otp, purpose = "REGISTRATION") => {
  try {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY must be set in server/.env");
    }

    let mailFrom = process.env.OTP_FROM_EMAIL;
    if (process.env.NODE_ENV === "production" && !mailFrom) {
      throw new Error("OTP_FROM_EMAIL must be set in server/.env in production");
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
      console.warn("Logo file not found, sending email without it:", err.message);
    }

    const attachments = [];
    if (logoBuffer) {
      attachments.push({
        filename: "logo.png",
        content: logoBuffer,
        contentId: "logo",
      });
    }

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

    const { data, error } = await resend.emails.send({
      from: mailFrom,
      to: [email],
      subject,
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
                            <img src="cid:logo" alt="Samarth Pest Management" style="max-height: 64px; max-width: 140px; object-fit: contain; display: block;" />
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
      attachments,
    });

    if (error) {
      console.error("Resend API Error details:", error.message || error);
      throw new Error(error.message || "Resend API returned an error");
    }

    console.log("Email Sent Successfully via Resend:", data?.id || "Sent");
    return data;
  } catch (error) {
    console.error("Email Error:", error.message || "Email sending failed");
    throw new Error(error.message || "Failed to send email");
  }
};

export default sendMail;

