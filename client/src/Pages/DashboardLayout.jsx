import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "../Components/Sidebar";

function DashboardLayout() {
  const location = useLocation();
  const isDark =
    location.pathname.toLowerCase().includes("upload") ||
    location.pathname.toLowerCase().includes("job-numbers");

  useEffect(() => {
    if (isDark) {
      const origBodyBg = document.body.style.backgroundColor;
      const origHtmlBg = document.documentElement.style.backgroundColor;
      document.body.style.backgroundColor = "#0f172a";
      document.documentElement.style.backgroundColor = "#0f172a";
      return () => {
        document.body.style.backgroundColor = origBodyBg;
        document.documentElement.style.backgroundColor = origHtmlBg;
      };
    }
  }, [isDark]);

  return (
    <div className={`min-h-screen w-full lg:flex ${isDark ? "bg-[#0f172a]" : "bg-[#f5f7fb]"}`}>
      <Sidebar />

      <main className={`min-w-0 flex-1 lg:ml-72 flex flex-col min-h-screen ${isDark ? "bg-[#0f172a] text-slate-100" : ""}`}>
        <Outlet />
      </main>
    </div>
  );
}

export default DashboardLayout;
