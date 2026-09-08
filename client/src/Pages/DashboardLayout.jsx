import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "../Components/Sidebar";

function DashboardLayout() {
  const location = useLocation();
  const isUpload = location.pathname.toLowerCase().includes("upload");

  return (
    <div className={`min-h-screen lg:flex ${isUpload ? "bg-slate-900" : "bg-[#f5f7fb]"}`}>
      <Sidebar />

      <main className={`min-w-0 flex-1 lg:ml-72 flex flex-col min-h-screen ${isUpload ? "bg-slate-900 text-slate-100" : ""}`}>
        <Outlet />
      </main>
    </div>
  );
}

export default DashboardLayout;
