import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { login } from "../../slices/authSlice";
import { Link, useNavigate } from "react-router-dom";

function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const { loading, error } = useSelector(
    (state) => state.auth
  );

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

    const result = await dispatch(login(formData));

    if (login.fulfilled.match(result)) {
      navigate("/");
    }
  };

  return (
    <div className="relative min-h-screen bg-slate-950 flex items-center justify-center px-4 py-8 overflow-hidden">
      {/* CSS Animation Keyframes */}
      <style>{`
        @keyframes blob1 {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(40px, -40px) scale(1.05); }
          66% { transform: translate(-20px, 20px) scale(0.95); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes blob2 {
          0% { transform: translate(0px, 0px) scale(1); }
          50% { transform: translate(-30px, 30px) scale(0.98); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes blob3 {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(-10px, -20px) scale(1.02); }
          66% { transform: translate(30px, -10px) scale(0.96); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob1 {
          animation: blob1 15s infinite alternate ease-in-out;
        }
        .animate-blob2 {
          animation: blob2 12s infinite alternate ease-in-out;
        }
        .animate-blob3 {
          animation: blob3 18s infinite alternate ease-in-out;
        }
      `}</style>

      {/* Floating Animated Background Blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[15%] left-[15%] w-[350px] h-[350px] rounded-full bg-cyan-600/15 blur-[80px] animate-blob1"></div>
        <div className="absolute bottom-[15%] right-[15%] w-[400px] h-[400px] rounded-full bg-blue-600/10 blur-[90px] animate-blob2"></div>
        <div className="absolute top-[45%] right-[25%] w-[320px] h-[320px] rounded-full bg-indigo-500/10 blur-[75px] animate-blob3"></div>
      </div>

      <div className="w-full max-w-md bg-white/95 backdrop-blur-md border border-slate-200/50 rounded-2xl shadow-2xl shadow-slate-950/40 p-6 sm:p-8 relative z-10">
        {/* SPM Logo & Operations Dashboard */}
        <div className="flex flex-col items-center mb-6">
          <div className="flex h-12 items-center rounded-lg bg-white px-3 shadow-md border border-slate-100 mb-3">
            <img src="/logo.png" alt="SPM Logo" className="h-8 w-auto object-contain" />
          </div>
          <p className="text-xs font-bold tracking-widest text-blue-600 uppercase">Operations Dashboard</p>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 text-center mb-1">
          Welcome Back
        </h1>

        <p className="text-slate-500 text-center text-sm mb-6">
          Login to your CRM account
        </p>

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <input
            type="email"
            name="email"
            placeholder="Email"
            value={formData.email}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg p-3 transition focus:border-cyan-600 outline-none"
          />

          <input
            type="password"
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg p-3 transition focus:border-cyan-600 outline-none"
          />

          {error && (
            <p className="text-red-500 text-sm text-center">
              {error}
            </p>
          )}

          <button
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-cyan-700 transition disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Loading..." : "Login"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm">
          Don't have an account?{" "}
          <Link
            to="/register"
            className="text-blue-600 font-medium hover:underline"
          >
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Login;
