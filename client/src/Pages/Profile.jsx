import { useState } from "react";
import { useSelector } from "react-redux";
import ChangePasswordModal from "../Components/ChangePasswordModal";

function Profile() {
  const { user } = useSelector((state) => state.auth);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const role = String(user?.role || "employee").toLowerCase().trim();
  const isAdmin = role === "admin";

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen bg-[#f5f7fb]">
      <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200/60 max-w-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-100 gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">
                {isAdmin ? "Admin Profile" : "Employee Profile"}
              </h1>
              <span
                className={`text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                  isAdmin
                    ? "bg-red-50 text-red-700 border-red-200"
                    : "bg-blue-50 text-blue-700 border-blue-200"
                }`}
              >
                {isAdmin ? "Administrator" : "Employee"}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Account information and security credentials
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPasswordModal(true)}
            className="bg-slate-800 hover:bg-slate-900 text-white font-medium text-xs px-4 py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm self-start sm:self-auto cursor-pointer"
          >
            Change Password
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</label>
            <p className="text-slate-800 font-medium text-sm mt-1">{user?.name || "N/A"}</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</label>
            <p className="text-slate-800 font-medium text-sm mt-1">{user?.email || "N/A"}</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Phone</label>
            <p className="text-slate-800 font-medium text-sm mt-1">{user?.phone || "N/A"}</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Account Role</label>
            <p className="text-slate-800 font-semibold text-sm mt-1 capitalize">{role}</p>
          </div>
        </div>

        <ChangePasswordModal
          isOpen={showPasswordModal}
          onClose={() => setShowPasswordModal(false)}
        />
      </div>
    </div>
  );
}

export default Profile;
