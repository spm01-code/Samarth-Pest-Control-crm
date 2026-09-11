import { useState, useEffect } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { verifyOtp } from "../../slices/authSlice";
import { resendRegistrationOTP } from "../../API/authAPI";
import { toast } from "../../utils/toast";
import { getErrorMessage } from "../../utils/errorHandler";

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

function VerifyOtp() {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const email = location.state?.email;

  const { loading, error } = useSelector(
    (state) => state.auth
  );

  const [otp, setOtp] = useState("");
  const [isResending, setIsResending] = useState(false);
  const [countdown, setCountdown] = useState(60);

  useEffect(() => {
    let timer;
    if (countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (otp.length !== 6 || loading) return;

    const result = await dispatch(
      verifyOtp({
        email,
        otp,
      })
    );

    if (verifyOtp.fulfilled.match(result)) {
      toast.success("Email verified successfully! You can now log in.");
      navigate("/login");
    } else {
      toast.error(getErrorMessage(result.payload || result.error, "Verification failed"));
    }
  };

  const handleResend = async () => {
    if (countdown > 0 || isResending || !email) return;

    setIsResending(true);
    try {
      await resendRegistrationOTP({ email });
      toast.success("Verification code resent to your email.");
      setCountdown(60);
      setOtp("");
    } catch (err) {
      toast.error(getErrorMessage(err, "Unable to send verification code. Please try again."));
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-[#08254b] to-cyan-900 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl shadow-slate-950/30 p-6 sm:p-8">
        <p className="text-sm font-semibold tracking-wide text-cyan-700 mb-2">ACCOUNT SECURITY</p>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">
          Verify Email
        </h1>

        <p className="text-slate-500 mb-6 text-sm">
          Enter the 6-digit code sent to{" "}
          <span className="font-semibold text-slate-800">{maskEmail(email) || "your email"}</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="••••••"
            className="w-full border border-slate-300 rounded-lg p-3 text-center text-2xl font-mono tracking-[0.5em] font-bold text-slate-900 transition focus:border-cyan-600 outline-none"
            autoFocus
          />

          {error && (
            <p className="text-red-500 text-sm text-center font-medium bg-red-50 p-2.5 rounded-lg border border-red-100">
              {error}
            </p>
          )}

          <button
            disabled={otp.length !== 6 || loading}
            className="w-full bg-cyan-600 text-white py-3 rounded-lg font-semibold hover:bg-cyan-700 transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Verify OTP"}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
          <span className="text-slate-500">Didn't receive code?</span>
          <button
            type="button"
            onClick={handleResend}
            disabled={countdown > 0 || isResending || !email}
            className="text-cyan-700 hover:text-cyan-800 font-semibold disabled:text-slate-400 disabled:cursor-not-allowed transition"
          >
            {isResending
              ? "Sending..."
              : countdown > 0
              ? `Resend in ${countdown}s`
              : "Resend Code"}
          </button>
        </div>

        <div className="mt-4 text-center">
          <Link to="/register" className="text-xs text-slate-500 hover:text-slate-700 underline">
            Back to Register
          </Link>
        </div>
      </div>
    </div>
  );
}

export default VerifyOtp;
