import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { verifyOtp } from "../../slices/authSlice";

function VerifyOtp() {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const email = location.state?.email;

  const { loading, error } = useSelector(
    (state) => state.auth
  );

  const [otp, setOtp] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    const result = await dispatch(
      verifyOtp({
        email,
        otp,
      })
    );

    if (verifyOtp.fulfilled.match(result)) {
      navigate("/login");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-[#08254b] to-cyan-900 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl shadow-slate-950/30 p-6 sm:p-8">
        <p className="text-sm font-semibold tracking-wide text-cyan-700 mb-2">ACCOUNT SECURITY</p>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">
          Verify OTP
        </h1>

        <p className="text-gray-500 mb-6">
          Enter the OTP sent to {email}
        </p>

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <input
            type="text"
            maxLength={6}
            value={otp}
            onChange={(e) =>
              setOtp(e.target.value)
            }
            placeholder="Enter OTP"
            className="w-full border border-slate-300 rounded-lg p-3 text-center tracking-[0.4em] transition focus:border-cyan-600"
          />

          {error && (
            <p className="text-red-500 text-sm">
              {error}
            </p>
          )}

          <button
            disabled={loading}
            className="w-full bg-cyan-600 text-white py-3 rounded-lg font-semibold hover:bg-cyan-700 transition disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading
              ? "Verifying..."
              : "Verify OTP"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default VerifyOtp;
