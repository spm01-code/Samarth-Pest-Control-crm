import { useSelector } from "react-redux";
import { useNavigate, useLocation, Link } from "react-router-dom";
import {
  HiOutlineArrowLeft,
  HiOutlineHome,
  HiOutlineArrowRightOnRectangle,
  HiOutlineUsers,
  HiOutlineWrenchScrewdriver,
  HiOutlineDocumentText,
  HiOutlineBellAlert,
  HiOutlineCog6Tooth,
} from "react-icons/hi2";
import logo from "/logo.png";

function PageNotFound() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = useSelector((state) => state.auth.token);

  const quickLinks = [
    { name: "Customers", path: "/", icon: HiOutlineUsers },
    { name: "Services", path: "/services", icon: HiOutlineWrenchScrewdriver },
    { name: "Invoices", path: "/invoices", icon: HiOutlineDocumentText },
    { name: "Quotations", path: "/quotation", icon: HiOutlineDocumentText },
    { name: "Alerts", path: "/alerts", icon: HiOutlineBellAlert },
    { name: "Settings", path: "/settings", icon: HiOutlineCog6Tooth },
  ];

  return (
    <div className="min-h-screen bg-[#f5f7fb] flex flex-col justify-center items-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-xl text-center">
        {/* Brand / Logo */}
        <div className="flex justify-center mb-6">
          <div className="flex items-center gap-3 bg-white px-5 py-2.5 rounded-2xl shadow-sm border border-gray-100">
            <img src={logo} alt="CRM Logo" className="h-8 w-auto object-contain" />
            <span className="text-lg font-bold text-gray-800 tracking-tight">CRM Portal</span>
          </div>
        </div>

        {/* 404 Main Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 sm:p-10 mb-6">
          {/* Subtle 404 Badge */}
          <div className="inline-flex items-center justify-center px-3.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-red-50 text-red-600 border border-red-100 mb-4">
            Error 404
          </div>

          <h1 className="text-6xl sm:text-7xl font-extrabold text-gray-900 tracking-tight mb-3">
            404
          </h1>

          <h2 className="text-2xl font-bold text-gray-800 mb-3">
            Page Not Found
          </h2>

          <p className="text-gray-500 text-sm sm:text-base max-w-md mx-auto mb-5">
            The page you are looking for doesn't exist, has been removed, or the link is incorrect.
          </p>

          {/* Current Path Pill */}
          <div className="inline-block bg-gray-50 border border-gray-200 rounded-lg px-3.5 py-1.5 text-xs text-gray-600 font-mono mb-8 max-w-full truncate">
            {location.pathname}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 hover:border-gray-400 transition cursor-pointer"
            >
              <HiOutlineArrowLeft className="w-4 h-4" />
              Go Back
            </button>

            {token ? (
              <Link
                to="/"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 shadow-sm transition"
              >
                <HiOutlineHome className="w-4 h-4" />
                Back to Dashboard
              </Link>
            ) : (
              <Link
                to="/login"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 shadow-sm transition"
              >
                <HiOutlineArrowRightOnRectangle className="w-4 h-4" />
                Go to Login
              </Link>
            )}
          </div>
        </div>

        {/* Quick Navigation Links (if logged in) */}
        {token && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">
              Quick Navigation
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {quickLinks.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    to={item.path}
                    className="flex items-center gap-2.5 p-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition group border border-transparent hover:border-blue-100"
                  >
                    <Icon className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PageNotFound;
