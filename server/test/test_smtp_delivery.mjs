import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import sendMail, { verifySmtpConnection, getSmtpTransporter } from "../utils/sendEmail.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

async function runSmtpVerification() {
  console.log("================================================================");
  console.log("       SAMARTH CRM: NODEMAILER + HOSTINGER SMTP TEST SUITE      ");
  console.log("================================================================");

  console.log("\n[STEP 1] Inspecting SMTP Configuration from Environment");
  console.log("  SMTP_HOST     :", process.env.SMTP_HOST || "(not set - will default to smtp.hostinger.com)");
  console.log("  SMTP_PORT     :", process.env.SMTP_PORT || "465");
  console.log("  SMTP_USER     :", process.env.SMTP_USER || "(not set)");
  console.log("  SMTP_PASS     :", process.env.SMTP_PASS ? "[CONFIGURED - REDACTED]" : "[NOT SET]");
  console.log("  OTP_FROM_EMAIL:", process.env.OTP_FROM_EMAIL || "(default)");

  console.log("\n[STEP 2] Verifying Transporter Initialization");
  const transporter = getSmtpTransporter();
  if (!transporter) {
    console.log("  ⚠️ Transporter could not initialize because SMTP_PASS is not set.");
  } else {
    console.log("  ✓ Transporter successfully initialized with connection pooling.");
  }

  console.log("\n[STEP 3] Testing SMTP Connection (verify)");
  const connectionResult = await verifySmtpConnection();
  if (connectionResult.success) {
    console.log("  ✓ SUCCESS: Connected and authenticated with Hostinger SMTP server!");
    console.log(`  Connected Host: ${connectionResult.host}:${connectionResult.port}`);
    console.log(`  Authenticated User: ${connectionResult.user}`);
  } else {
    console.log(`  ℹ️ SMTP verification result: ${connectionResult.error}`);
  }

  console.log("\n[STEP 4] Testing Simulated Test Email Delivery (Synthetic Email)");
  try {
    const testResult = await sendMail("test_worker@spm.local", "123456", "REGISTRATION");
    console.log("  ✓ Simulated delivery succeeded:", testResult.id);
  } catch (err) {
    console.error("  ✗ Simulated delivery failed:", err.message);
  }

  // Check if a live test recipient was provided via command-line arguments
  const liveRecipient = process.argv[2];
  if (liveRecipient && connectionResult.success) {
    console.log(`\n[STEP 5] Testing Real Delivery to: ${liveRecipient}`);
    try {
      const liveResult = await sendMail(liveRecipient, "789012", "REGISTRATION");
      console.log("  ✓ LIVE EMAIL DELIVERED SUCCESSFULLY!");
      console.log("  Message ID:", liveResult.id);
      console.log("  Accepted by:", liveResult.accepted);
    } catch (err) {
      console.error("  ✗ Live delivery failed:", err.message);
    }
  } else if (!liveRecipient) {
    console.log("\n[INFO] To send a real live email to your inbox, run:");
    console.log("  node test/test_smtp_delivery.mjs your_email@domain.com");
  }

  console.log("\n================================================================");
  console.log("                    SMTP TEST RUN COMPLETE                      ");
  console.log("================================================================");
}

runSmtpVerification();
