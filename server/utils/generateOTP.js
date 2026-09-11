import crypto from "crypto";

const generateOTP = () => {
  return crypto.randomInt(100000, 1000000).toString();
};

export const hashOTP = (otp) => {
  if (!otp) return "";
  return crypto.createHash("sha256").update(String(otp).trim()).digest("hex");
};

export const verifyOTPHash = (inputOtp, storedHash) => {
  if (!inputOtp || !storedHash) return false;
  const inputHash = hashOTP(inputOtp);
  try {
    const a = Buffer.from(inputHash, "hex");
    const b = Buffer.from(storedHash, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
};

export default generateOTP;