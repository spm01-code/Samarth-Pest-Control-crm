import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { verifyOTP, resendRegistrationOTP } from "../API/authAPI";
import { toast } from "../utils/toast";
import { getErrorMessage } from "../utils/errorHandler";
import { useBodyScrollLock } from "../utils/useBodyScrollLock";

function maskEmail(email) {
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return email || "";
  }
  const [namePart, domainPart] = email.split("@");
  if (namePart.length <= 2) {
    return `${namePart[0]}***@${domainPart}`;
  }
  return `${namePart[0]}***${namePart[namePart.length - 1]}@${domainPart}`;
}

function VerifyEmailModal({ isOpen, onClose, email, onSuccess }) {
  const [otp, setOtp] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [countdown, setCountdown] = useState(60);

  // Lock body scroll when modal is open
  useBodyScrollLock(isOpen);

  // Cooldown countdown timer
  useEffect(() => {
    let timer;
    if (isOpen && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isOpen, countdown]);


  const handleOtpChange = (e) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 6);
    setOtp(value);
    if (errorMessage) {
      setErrorMessage("");
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (otp.length !== 6 || isVerifying) return;

    setIsVerifying(true);
    setErrorMessage("");

    try {
      await verifyOTP({ email, otp });
      toast.success("Email verified successfully! You can now log in.");
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      const msg = getErrorMessage(err, "Invalid verification code. Please try again.");
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0 || isResending || isVerifying) return;

    setIsResending(true);
    setErrorMessage("");

    try {
      await resendRegistrationOTP({ email });
      toast.success("Verification code resent to your email.");
      setCountdown(60);
      setOtp("");
    } catch (err) {
      const msg = getErrorMessage(err, "Unable to send verification code. Please try again.");
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsResending(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="verify-email-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 sm:p-8 relative border border-slate-100">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={isVerifying}
          aria-label="Close dialog"
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 text-2xl leading-none transition disabled:opacity-50"
        >
          &times;
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h2 id="verify-email-title" className="text-2xl font-bold text-slate-900">
            Verify Your Email
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Enter the verification code sent to your email.
          </p>
          {email && (
            <p className="text-xs font-medium text-slate-600 mt-2 bg-slate-50 py-1 px-3 rounded-full inline-block border border-slate-200">
              We sent a verification code to <span className="font-semibold text-slate-900">{maskEmail(email)}</span>
            </p>
          )}
        </div>

        {/* Verification Form */}
        <form onSubmit={handleVerify} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wider text-center">
              6-Digit Verification Code
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={handleOtpChange}
              placeholder="••••••"
              disabled={isVerifying}
              className="w-full border border-slate-300 rounded-xl py-3 px-4 text-center text-2xl font-mono tracking-[0.5em] font-bold text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition disabled:bg-slate-100"
              autoFocus
            />
          </div>

          {errorMessage && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3.5 py-2.5 rounded-lg text-center font-medium">
              {errorMessage}
            </div>
          )}

          {/* Action Buttons */}
          <button
            type="submit"
            disabled={otp.length !== 6 || isVerifying}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-600/20 flex items-center justify-center gap-2"
          >
            {isVerifying ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Verifying...</span>
              </>
            ) : (
              "Verify Code"
            )}
          </button>
        </form>

        {/* Resend Section */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <span className="text-slate-500">Didn't receive the code?</span>
          <button
            type="button"
            onClick={handleResend}
            disabled={countdown > 0 || isResending || isVerifying}
            className="text-blue-600 hover:text-blue-700 font-semibold disabled:text-slate-400 disabled:cursor-not-allowed transition"
          >
            {isResending
              ? "Sending..."
              : countdown > 0
              ? `Resend OTP in ${countdown}s`
              : "Resend OTP"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default VerifyEmailModal;
