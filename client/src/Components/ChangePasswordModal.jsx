import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSelector } from "react-redux";
import {
  requestPasswordChangeOTP,
  verifyPasswordChangeAPI,
} from "../API/authAPI";
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

function ChangePasswordModal({ isOpen, onClose }) {
  const token = useSelector((state) => state.auth.token);
  const currentUser = useSelector((state) => state.auth.user);

  // Step 1 = passwords input, Step 2 = OTP verification
  const [step, setStep] = useState(1);

  // Form State
  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [otp, setOtp] = useState("");
  const [maskedRecipient, setMaskedRecipient] = useState(() =>
    maskEmail(currentUser?.email || "")
  );


  // Loading & Error States
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [countdown, setCountdown] = useState(60);

  // Lock background scroll when open
  useBodyScrollLock(isOpen);

  // Countdown timer for resend
  useEffect(() => {
    let timer;
    if (isOpen && step === 2 && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isOpen, step, countdown]);


  const handlePasswordChange = (e) => {
    setPasswords((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
    if (errorMessage) setErrorMessage("");
  };

  const handleOtpChange = (e) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 6);
    setOtp(value);
    if (errorMessage) setErrorMessage("");
  };

  // STEP 1: Request OTP
  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!passwords.currentPassword || !passwords.newPassword || !passwords.confirmPassword) {
      setErrorMessage("Please fill in all password fields.");
      return;
    }

    if (passwords.newPassword !== passwords.confirmPassword) {
      setErrorMessage("New password and confirm password do not match.");
      return;
    }

    if (passwords.newPassword.length < 6) {
      setErrorMessage("New password must be at least 6 characters long.");
      return;
    }

    if (passwords.currentPassword === passwords.newPassword) {
      setErrorMessage("New password cannot be the same as current password.");
      return;
    }

    setIsLoading(true);

    try {
      const res = await requestPasswordChangeOTP(
        {
          currentPassword: passwords.currentPassword,
          newPassword: passwords.newPassword,
          confirmPassword: passwords.confirmPassword,
        },
        token
      );

      toast.success(res.message || "Verification code sent to your registered email.");
      if (res.email) {
        setMaskedRecipient(maskEmail(res.email));
      }
      setStep(2);
      setCountdown(60);
      setOtp("");
    } catch (err) {
      const msg = getErrorMessage(err, "Unable to send verification code. Please try again.");
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // STEP 2: Verify OTP and Commit Password Change
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otp.length !== 6 || isLoading) return;

    setIsLoading(true);
    setErrorMessage("");

    try {
      // Send ONLY { otp } as the password was pre-validated and bound to pending challenge
      const res = await verifyPasswordChangeAPI({ otp }, token);

      toast.success(res.message || "Password changed successfully!");
      handleClose();
    } catch (err) {
      const msg = getErrorMessage(err, "Invalid or expired verification code.");
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Resend OTP in Step 2
  const handleResendOtp = async () => {
    if (countdown > 0 || isResending || isLoading) return;

    setIsResending(true);
    setErrorMessage("");

    try {
      const res = await requestPasswordChangeOTP(
        {
          currentPassword: passwords.currentPassword,
          newPassword: passwords.newPassword,
          confirmPassword: passwords.confirmPassword,
        },
        token
      );

      toast.success(res.message || "New verification code sent to your registered email.");
      setCountdown(60);
      setOtp("");
    } catch (err) {
      const msg = getErrorMessage(err, "Unable to resend verification code. Please try again.");
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsResending(false);
    }
  };

  const handleClose = () => {
    if (isLoading) return;
    setPasswords({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    setOtp("");
    setErrorMessage("");
    setStep(1);
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-password-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 sm:p-8 relative border border-slate-100">
        {/* Close button */}
        <button
          type="button"
          onClick={handleClose}
          disabled={isLoading}
          aria-label="Close change password dialog"
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 text-2xl leading-none transition disabled:opacity-50"
        >
          &times;
        </button>

        {/* STEP 1: Passwords Input */}
        {step === 1 && (
          <div>
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
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <h2 id="change-password-title" className="text-2xl font-bold text-slate-900">
                Change Password
              </h2>
              <p className="text-slate-500 text-xs mt-1">
                Enter your current password and choose a new secure password.
              </p>
            </div>

            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  name="currentPassword"
                  required
                  value={passwords.currentPassword}
                  onChange={handlePasswordChange}
                  placeholder="Enter current password"
                  disabled={isLoading}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition disabled:bg-slate-100"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  name="newPassword"
                  required
                  value={passwords.newPassword}
                  onChange={handlePasswordChange}
                  placeholder="At least 6 characters"
                  disabled={isLoading}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  name="confirmPassword"
                  required
                  value={passwords.confirmPassword}
                  onChange={handlePasswordChange}
                  placeholder="Re-enter new password"
                  disabled={isLoading}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition disabled:bg-slate-100"
                />
              </div>

              {errorMessage && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3.5 py-2.5 rounded-lg text-center font-medium">
                  {errorMessage}
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isLoading}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition disabled:opacity-50 flex items-center gap-2 shadow-sm"
                >
                  {isLoading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Validating & Sending OTP...</span>
                    </>
                  ) : (
                    "Continue / Send OTP"
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* STEP 2: OTP Verification */}
        {step === 2 && (
          <div>
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
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-900">
                Verify Password Change
              </h2>
              <p className="text-slate-500 text-xs mt-1">
                Enter the OTP sent to your registered email address.
              </p>
              {maskedRecipient && (
                <p className="text-xs font-medium text-slate-600 mt-2 bg-slate-50 py-1 px-3 rounded-full inline-block border border-slate-200">
                  Registered Email: <span className="font-semibold text-slate-900">{maskedRecipient}</span>
                </p>
              )}
            </div>

            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wider text-center">
                  6-Digit OTP Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otp}
                  onChange={handleOtpChange}
                  placeholder="••••••"
                  disabled={isLoading}
                  className="w-full border border-slate-300 rounded-xl py-3 px-4 text-center text-2xl font-mono tracking-[0.5em] font-bold text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition disabled:bg-slate-100"
                  autoFocus
                />
              </div>

              {errorMessage && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3.5 py-2.5 rounded-lg text-center font-medium">
                  {errorMessage}
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setErrorMessage("");
                  }}
                  disabled={isLoading}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition disabled:opacity-50"
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  disabled={otp.length !== 6 || isLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Verifying & Changing...</span>
                    </>
                  ) : (
                    "Verify & Change Password"
                  )}
                </button>
              </div>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500">Didn't receive code?</span>
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={countdown > 0 || isResending || isLoading}
                className="text-blue-600 hover:text-blue-700 font-semibold disabled:text-slate-400 disabled:cursor-not-allowed transition"
              >
                {isResending
                  ? "Sending..."
                  : countdown > 0
                  ? `Resend in ${countdown}s`
                  : "Resend OTP"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export default ChangePasswordModal;
