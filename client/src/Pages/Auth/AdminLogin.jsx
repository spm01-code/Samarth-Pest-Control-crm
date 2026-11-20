import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useParams, useNavigate, Link } from "react-router-dom";
import { loginSecretAdmin } from "../../slices/authSlice";
import PasswordInput from "../../Components/PasswordInput";
import PageNotFound from "../PageNotFound";
import { HiOutlineShieldCheck } from "react-icons/hi2";

function AdminLogin() {
  const { secretPath } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const configuredSecret = import.meta.env.VITE_ADMIN_SECRET_PATH;

  // Unpredictable Secret Route verification - Return 404 if route segment mismatch
  if (!configuredSecret || secretPath !== configuredSecret) {
    return <PageNotFound />;
  }

  const { loading, error } = useSelector((state) => state.auth);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await dispatch(
      loginSecretAdmin({
        secretPath,
        data: formData,
      })
    );

    if (loginSecretAdmin.fulfilled.match(result)) {
      navigate("/");
    }
  };

  return (
    <div className="relative min-h-screen bg-slate-950 flex items-center justify-center px-4 py-8 overflow-hidden">
      {/* Floating Shield Blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[10%] left-[20%] w-[380px] h-[380px] rounded-full bg-red-600/10 blur-[90px]"></div>
        <div className="absolute bottom-[10%] right-[20%] w-[420px] h-[420px] rounded-full bg-purple-600/10 blur-[100px]"></div>
      </div>

      <div className="w-full max-w-md bg-white/95 backdrop-blur-md border border-red-500/30 rounded-2xl shadow-2xl shadow-slate-950/60 p-6 sm:p-8 relative z-10">
        <div className="flex flex-col items-center mb-6">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-red-600 to-slate-900 text-white shadow-lg mb-3">
            <HiOutlineShieldCheck className="size-8" />
          </div>
          <span className="text-[11px] font-extrabold tracking-widest text-red-600 uppercase bg-red-50 px-2.5 py-1 rounded-md border border-red-200">
            Privileged Admin Portal
          </span>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 text-center mb-1">
          Admin Authentication
        </h1>
        <p className="text-slate-500 text-center text-xs mb-6">
          Restricted access. All connection attempts are strictly audited.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
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
              className="w-full border border-slate-300 rounded-lg p-3 transition focus:border-red-600 outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Master Password
            </label>
            <PasswordInput
              name="password"
              placeholder="••••••••••••"
              value={formData.password}
              onChange={handleChange}
              required
              className="w-full border border-slate-300 rounded-lg p-3 transition focus:border-red-600 outline-none text-sm"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs font-medium text-center">
              {error}
            </div>
          )}

          <button
            disabled={loading}
            className="w-full bg-slate-900 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition disabled:cursor-not-allowed disabled:opacity-70 shadow-md cursor-pointer"
          >
            {loading ? "Authenticating Admin..." : "Authenticate as Admin"}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <Link
            to={`/secure-access/${secretPath}/register`}
            className="text-red-600 font-medium hover:underline"
          >
            Bootstrap Registration
          </Link>
          <Link to="/login" className="text-slate-400 hover:text-slate-600 hover:underline">
            Normal Login
          </Link>
        </div>
      </div>
    </div>
  );
}

export default AdminLogin;
