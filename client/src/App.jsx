import { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { BASE_URL } from "./API/apiConfig";

import DashboardLayout from "./Pages/DashboardLayout";
import ProtectedRoute from "./Components/ProtectedRoute";

import Login from "./Pages/Auth/Login";
import Register from "./Pages/Auth/Register";
import VerifyOtp from "./Pages/Auth/VerifyOtp";
import AdminLogin from "./Pages/Auth/AdminLogin";
import AdminRegister from "./Pages/Auth/AdminRegister";

import Customers from "./Pages/Customers";
import Employees from "./Pages/Employees";
import Services from "./Pages/Services";
import Quotations from "./Pages/Quotations";
import Invoices from "./Pages/Invoices";
import Profile from "./Pages/Profile";
import CustomerProfile from "./Pages/CustomerProfile";
import ServiceDetails from "./Pages/ServiceDetails";
import InvoiceDetails from "./Pages/InvoiceDetails";
import EmployeeDetails from "./Pages/EmployeeDetails";
import QuotationDetails from "./Pages/QuotationDetails";
import Alerts from "./Pages/Alerts";
import Attendance from "./Pages/Attendance";
import Renewals from "./Pages/Renewals";
import RenewalDetails from "./Pages/RenewalDetails";
import Upload from "./Pages/Upload";
import Settings from "./Pages/Settings";
import JobNumberManagement from "./Pages/JobNumberManagement";
import PageNotFound from "./Pages/PageNotFound";
import ServerWakingUpLoader from "./Components/ServerWakingUpLoader";
import ToastContainer from "./Components/ToastContainer";

function App() {
  const token = useSelector((state) => state.auth.token);
  const [isServerAwake, setIsServerAwake] = useState(false);
  const [showLoader, setShowLoader] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    // Show loader if the server check takes longer than 800ms
    const timer = setTimeout(() => {
      if (isMounted) setShowLoader(true);
    }, 800);

    const checkServer = async () => {
      try {
        await fetch(BASE_URL, { signal: controller.signal });
        if (isMounted) {
          clearTimeout(timer);
          setIsServerAwake(true);
          setShowLoader(false);
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Backend cold start check failed, retrying in 3s...", err);
          if (isMounted) {
            setTimeout(checkServer, 3000);
          }
        }
      }
    };

    checkServer();

    return () => {
      isMounted = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  if (!isServerAwake) {
    if (showLoader) {
      return <ServerWakingUpLoader />;
    }
    return null;
  }

  return (
    <>
      <ToastContainer />
      <Routes>
        {/* Normal Public Auth Routes */}
        <Route path="/login" element={!token ? <Login /> : <Navigate to="/" />} />
        <Route path="/register" element={!token ? <Register /> : <Navigate to="/" />} />
        <Route path="/verify-otp" element={!token ? <VerifyOtp /> : <Navigate to="/" />} />

        {/* Secret Admin Authentication Routes */}
        <Route
          path="/secure-access/:secretPath/login"
          element={!token ? <AdminLogin /> : <Navigate to="/" />}
        />
        <Route
          path="/secure-access/:secretPath/register"
          element={!token ? <AdminRegister /> : <Navigate to="/" />}
        />
        <Route
          path="/secure-access/:secretPath"
          element={<Navigate to="login" replace />}
        />

        {/* Dashboard Layout: Protected by Token */}
        <Route element={token ? <DashboardLayout /> : <Navigate to="/login" />}>
          {/* General Routes (Allowed for both Admin and Employee) */}
          <Route path="/" element={<Customers />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/services" element={<Services />} />
          <Route path="/one-time-jobs" element={<Services isOneTimePage={true} />} />
          <Route path="/quotation" element={<Quotations />} />
          <Route path="/renewals" element={<Renewals />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/profile" element={<Profile />} />

          <Route path="/customers/:id" element={<CustomerProfile />} />
          <Route path="/services/:id" element={<ServiceDetails />} />
          <Route path="/invoices/:id" element={<InvoiceDetails />} />
          <Route path="/quotations/:id" element={<QuotationDetails />} />
          <Route path="/renewals/:id" element={<RenewalDetails />} />

          {/* Admin-Only Routes: Strictly Protected */}
          <Route element={<ProtectedRoute allowedRoles={["admin"]} redirectTo="/" />}>
            <Route path="/employees" element={<Employees />} />
            <Route path="/employees/:id" element={<EmployeeDetails />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/job-numbers" element={<JobNumberManagement />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>

        {/* 404 - Page Not Found for all unhandled routes */}
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </>
  );
}

export default App;
