import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import PasswordInput from "../../Components/PasswordInput";
import PageNotFound from "../PageNotFound";
import { registerSecretAdminAPI } from "../../API/authAPI";
import { HiOutlineKey, HiOutlineShieldCheck } from "react-icons/hi2";

function AdminRegister() {
  const { secretPath } = useParams();
  const navigate = useNavigate();

  const configuredSecret =
    import.meta.env.VITE_ADMIN_SECRET_PATH || "6827b866034a1eadadfac16a5b34aa69";

  // Unpredictable Secret Route verification - Return 404 if route segment mismatch
  if (secretPath !== configuredSecret) {
    return <PageNotFound />;
  }

  const [formData, setFormData] = useState({
    bootstrapSecret: "",
    name: "",
    email: "",
    phone: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Validate password complexity
    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }
    if (!/[A-Z]/.test(formData.password) || !/[a-z]/.test(formData.password) || !/[0-9]/.test(formData.password)) {
      setError("Password must contain at least one uppercase letter, one lowercase letter, and one number");
      return;
    }

    try {
      setLoading(true);
      const res = await registerSecretAdminAPI(secretPath, formData);
      setSuccess(true);
      const cleanEmail = formData.email.trim().toLowerCase();
      sessionStorage.setItem("pendingVerificationEmail", cleanEmail);
      setTimeout(() => {
        navigate(`/verify-otp?email=${encodeURIComponent(cleanEmail)}`, {
          state: { email: cleanEmail },
        });
      }, 1500);
    } catch (err) {
      setError(err.message || "Admin bootstrap registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-slate-950 flex items-center justify-center px-4 py-8 overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[10%] left-[20%] w-[380px] h-[380px] rounded-full bg-red-600/10 blur-[90px]"></div>
        <div className="absolute bottom-[10%] right-[20%] w-[420px] h-[420px] rounded-full bg-amber-600/10 blur-[100px]"></div>
      </div>

      <div className="w-full max-w-lg bg-white/95 backdrop-blur-md border border-red-500/30 rounded-2xl shadow-2xl shadow-slate-950/60 p-6 sm:p-8 relative z-10">
        <div className="flex flex-col items-center mb-6">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-red-600 to-slate-900 text-white shadow-lg mb-3">
            <HiOutlineShieldCheck className="size-8" />
          </div>
          <span className="text-[11px] font-extrabold tracking-widest text-red-600 uppercase bg-red-50 px-2.5 py-1 rounded-md border border-red-200">
            Admin Bootstrap Portal
          </span>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 text-center mb-1">
          Register Administrator
        </h1>
        <p className="text-slate-500 text-center text-xs mb-6">
          Requires authorization via server-side bootstrap invitation token.
        </p>

        {success ? (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center text-emerald-800 text-sm">
            <p className="font-bold">Verification Code Sent!</p>
            <p className="text-xs text-emerald-600 mt-1">Redirecting to email verification...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-red-700 uppercase tracking-wider mb-1">
                <HiOutlineKey className="size-4" /> Server Bootstrap Secret
              </label>
              <input
                type="password"
                name="bootstrapSecret"
                placeholder="Enter server bootstrap secret key"
                value={formData.bootstrapSecret}
                onChange={handleChange}
                required
                className="w-full border-2 border-red-200 rounded-lg p-2.5 transition focus:border-red-600 outline-none text-sm font-mono"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  name="name"
                  placeholder="Admin Name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full border border-slate-300 rounded-lg p-2.5 transition focus:border-red-600 outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  name="phone"
                  placeholder="9876543210"
                  value={formData.phone}
                  onChange={handleChange}
                  required
                  className="w-full border border-slate-300 rounded-lg p-2.5 transition focus:border-red-600 outline-none text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Admin Email
              </label>
              <input
                type="email"
                name="email"
                placeholder="admin@spmservices.com"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full border border-slate-300 rounded-lg p-2.5 transition focus:border-red-600 outline-none text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Admin Password
              </label>
              <PasswordInput
                name="password"
                placeholder="Min 8 chars, 1 uppercase, 1 lowercase, 1 number"
                value={formData.password}
                onChange={handleChange}
                required
                className="w-full border border-slate-300 rounded-lg p-2.5 transition focus:border-red-600 outline-none text-sm"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Must be at least 8 characters with uppercase, lowercase, and numbers.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs font-medium text-center">
                {error}
              </div>
            )}

            <button
              disabled={loading}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 shadow-md cursor-pointer"
            >
              {loading ? "Registering Admin..." : "Complete Admin Registration"}
            </button>
          </form>
        )}

        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <Link
            to={`/secure-access/${secretPath}/login`}
            className="text-red-600 font-medium hover:underline"
          >
            ← Back to Admin Login
          </Link>
          <Link to="/login" className="text-slate-400 hover:text-slate-600 hover:underline">
            Normal Login
          </Link>
        </div>
      </div>
    </div>
  );
}

export default AdminRegister;
