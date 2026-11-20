import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import http from "http";
import express from "express";
import cookieParser from "cookie-parser";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

// Models
import Admin from "../model/adminModel.js";
import AuditLog from "../model/auditLogModel.js";

// Middlewares & Utils
import authMiddleware from "../middleware/authMiddleware.js";
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
} from "../utils/generateTokens.js";

// Routers
import adminRoutes from "../routes/adminRoute.js";
import customerRoutes from "../routes/customerRoute.js";
import employeeRoutes from "../routes/employeeRoute.js";
import serviceRoutes from "../routes/serviceRoute.js";
import invoiceRoutes from "../routes/invoiceRoute.js";
import quotationRoutes from "../routes/quotationRoute.js";
import attendanceRoutes from "../routes/attendanceRoute.js";
import renewalRoutes from "../routes/renewalRoute.js";
import jobNumberRoutes from "../routes/jobNumberRoute.js";
import companySettingRoutes from "../routes/companySettingRoute.js";
import templateRoutes from "../routes/templateRoute.js";
import importRoutes from "../routes/importRoute.js";

const TEST_PORT = 8124;
let server;
let baseUrl = `http://127.0.0.1:${TEST_PORT}`;

// Setup Express Test App
const app = express();
app.use(express.json());
app.use(cookieParser());

app.use("/api/admin", adminRoutes);
app.use("/api/secure-access", adminRoutes);
app.use("/api/customers", authMiddleware, customerRoutes);
app.use("/api/employees", authMiddleware, employeeRoutes);
app.use("/api/services", authMiddleware, serviceRoutes);
app.use("/api/invoices", authMiddleware, invoiceRoutes);
app.use("/api/quotations", authMiddleware, quotationRoutes);
app.use("/api/attendance", authMiddleware, attendanceRoutes);
app.use("/api/renewals", authMiddleware, renewalRoutes);
app.use("/api/job-numbers", authMiddleware, jobNumberRoutes);
app.use("/api/company-settings", companySettingRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/import", importRoutes);

// Helper for making HTTP requests in tests
async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const fetchOptions = {
    method: options.method || "GET",
    headers,
  };

  if (options.body) {
    fetchOptions.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }

  const res = await fetch(url, fetchOptions);
  let json = null;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = { raw: text };
  }

  // Extract set-cookie if any
  const cookieHeader = res.headers.get("set-cookie");

  return {
    status: res.status,
    headers: res.headers,
    cookie: cookieHeader,
    body: json,
  };
}

let testAdminId;
let testEmployeeId;
let createdCustomerId;
const createdUserIds = [];
let adminAccessToken;
let employeeAccessToken;
let adminRefreshToken;
let employeeRefreshToken;

const SECRET_PATH = process.env.ADMIN_SECRET_PATH;
const BOOTSTRAP_SECRET = process.env.ADMIN_BOOTSTRAP_SECRET;

async function runTests() {
  console.log("================================================================");
  console.log("      SAMARTH CRM: COMPREHENSIVE RBAC & SECURITY TEST SUITE     ");
  console.log("================================================================");

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  console.log("Connected to MongoDB.");

  // Start test server
  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, "127.0.0.1", () => {
      console.log(`Test Express server listening on ${baseUrl}`);
      resolve();
    });
  });

  const testPasses = [];
  const testFails = [];

  function assert(condition, testName) {
    if (condition) {
      console.log(`  ✓ PASS: ${testName}`);
      testPasses.push(testName);
    } else {
      console.error(`  ✗ FAIL: ${testName}`);
      testFails.push(testName);
    }
  }

  try {
    // Ensure clean state before testing
    await Admin.deleteMany({ email: { $regex: /@spm\.local$/ } });

    // -------------------------------------------------------------
    // Test Group 1: User Migration & Setup Verification
    // -------------------------------------------------------------
    console.log("\n[TEST GROUP 1] User Migration & Role Verification");
    const existingUsers = await Admin.find().select("email role isActive isVerified");
    assert(existingUsers.length >= 3, "Database contains all pre-existing user records");
    
    const baselineAdmins = await Admin.find({
      email: { $in: ["adhikpatil2005@gmail.com", "loopin94117@gmail.com", "jaymore313@gmail.com"] },
    });
    assert(baselineAdmins.length >= 3, "Database contains all baseline migrated users");
    assert(baselineAdmins.every((u) => u.role === "admin"), "All pre-existing baseline users have role: 'admin'");

    // Create a deterministic Test Admin
    const adminEmail = `test_admin_${Date.now()}@spm.local`;
    const hashedAdminPw = await bcrypt.hash("AdminPassword123!", 10);
    const testAdmin = await Admin.create({
      name: "Test Administrator",
      email: adminEmail,
      phone: "9876543210",
      password: hashedAdminPw,
      role: "admin",
      isActive: true,
      isVerified: true,
    });
    testAdminId = testAdmin._id;
    createdUserIds.push(testAdminId);
    console.log(`Created test admin: ${adminEmail}`);

    // Create a deterministic Test Employee
    const employeeEmail = `test_emp_${Date.now()}@spm.local`;
    const hashedEmpPw = await bcrypt.hash("EmployeePassword123!", 10);
    const testEmployee = await Admin.create({
      name: "Test Staff Member",
      email: employeeEmail,
      phone: "9876543211",
      password: hashedEmpPw,
      role: "employee",
      isActive: true,
      isVerified: true,
    });
    testEmployeeId = testEmployee._id;
    createdUserIds.push(testEmployeeId);
    console.log(`Created test employee: ${employeeEmail}`);

    // -------------------------------------------------------------
    // Test Group 2: Token Generation, Expiry & Claims
    // -------------------------------------------------------------
    console.log("\n[TEST GROUP 2] JWT Token Expiry & Security Claims");
    const testAccessToken = generateAccessToken(testAdmin);
    const decodedAccess = jwt.verify(testAccessToken, process.env.ACCESS_TOKEN_SECRET);
    
    assert(decodedAccess.adminId === String(testAdmin._id), "Access token contains correct adminId");
    assert(decodedAccess.role === "admin", "Access token contains correct role claim");
    
    // Check expiry: 15 minutes = 900 seconds
    const accessLifetimeSeconds = decodedAccess.exp - decodedAccess.iat;
    assert(accessLifetimeSeconds === 900, `Access token lifetime is exactly 15 minutes (900s, got ${accessLifetimeSeconds}s)`);

    const testRefreshToken = generateRefreshToken(testAdmin);
    const decodedRefresh = jwt.verify(testRefreshToken, process.env.REFRESH_TOKEN_SECRET);
    const refreshLifetimeSeconds = decodedRefresh.exp - decodedRefresh.iat;
    assert(refreshLifetimeSeconds === 12 * 3600, `Refresh token lifetime is 12 hours (43200s, got ${refreshLifetimeSeconds}s)`);

    // -------------------------------------------------------------
    // Test Group 3: Secret Admin Routes Authentication
    // -------------------------------------------------------------
    console.log("\n[TEST GROUP 3] Secret Admin Route Security");

    // 3a. Invalid secret path returns 404
    const badSecretLogin = await request("/api/secure-access/invalid-guess-path-12345/login", {
      method: "POST",
      body: { email: adminEmail, password: "AdminPassword123!" },
    });
    assert(badSecretLogin.status === 404, "Invalid secret path returns 404 Not Found");

    // 3b. Valid secret path with Admin credentials succeeds
    const goodSecretLogin = await request(`/api/secure-access/${SECRET_PATH}/login`, {
      method: "POST",
      body: { email: adminEmail, password: "AdminPassword123!" },
    });
    assert(goodSecretLogin.status === 200, "Admin login via valid secret path succeeds (200)");
    assert(goodSecretLogin.body.admin?.role === "admin", "Admin login returns verified role: 'admin'");
    assert(Boolean(goodSecretLogin.body.accessToken), "Admin login returns accessToken");
    assert(Boolean(goodSecretLogin.cookie && goodSecretLogin.cookie.includes("refreshToken")), "Admin login sets HttpOnly refreshToken cookie");
    adminAccessToken = goodSecretLogin.body.accessToken;

    // 3c. Employee attempting to log in via secret Admin route is REJECTED (403 Forbidden)
    const employeeAdminLoginAttempt = await request(`/api/secure-access/${SECRET_PATH}/login`, {
      method: "POST",
      body: { email: employeeEmail, password: "EmployeePassword123!" },
    });
    assert(employeeAdminLoginAttempt.status === 403, "Employee attempting Admin login is rejected with 403 Forbidden");
    assert(employeeAdminLoginAttempt.body.message.includes("Not an administrator"), "Error message clarifies account is not an administrator");

    // 3d. Secret Admin Bootstrap Registration without bootstrap secret is REJECTED
    const bootstrapWithoutSecret = await request(`/api/secure-access/${SECRET_PATH}/register`, {
      method: "POST",
      body: {
        name: "Hacker Admin",
        email: "hacker@evil.com",
        phone: "1112223334",
        password: "ValidPassword123!",
      },
    });
    assert(bootstrapWithoutSecret.status === 403, "Admin registration without bootstrap secret rejected with 403");

    // -------------------------------------------------------------
    // Test Group 4: Normal Login & Registration
    // -------------------------------------------------------------
    console.log("\n[TEST GROUP 4] Normal Employee Login & Role Enforcement");

    // 4a. Employee logs in via normal login endpoint
    const empLoginRes = await request("/api/admin/login", {
      method: "POST",
      body: { email: employeeEmail, password: "EmployeePassword123!" },
    });
    assert(empLoginRes.status === 200, "Employee normal login succeeds (200)");
    assert(empLoginRes.body.admin?.role === "employee", "Employee normal login retrieves actual role: 'employee'");
    employeeAccessToken = empLoginRes.body.accessToken;

    // 4b. Public registration sets role: "employee" by default and ignores role manipulation
    const newRegEmail = `test_reg_${Date.now()}@spm.local`;
    const regRes = await request("/api/admin/register", {
      method: "POST",
      body: {
        name: "Sneaky User",
        email: newRegEmail,
        phone: "9988776655",
        password: "SomePassword123!",
        role: "admin", // Malicious attempt to escalate role
      },
    });
    assert(regRes.status === 201 || regRes.status === 200, "Public registration accepted (201/200)");
    
    const registeredRecord = await Admin.findOne({ email: newRegEmail });
    assert(registeredRecord !== null, "New user record created");
    if (registeredRecord) createdUserIds.push(registeredRecord._id);
    assert(registeredRecord.role === "employee", "Newly registered user role is strictly forced to 'employee'");

    // -------------------------------------------------------------
    // Test Group 5: Backend Authorization & Mutation Blocking
    // -------------------------------------------------------------
    console.log("\n[TEST GROUP 5] Backend RBAC & Mutation Blocking for Employee");

    // 5a. Customer Module
    // Employee CAN view customers
    const empGetCust = await request("/api/customers", {
      headers: { Authorization: `Bearer ${employeeAccessToken}` },
    });
    assert(empGetCust.status === 200, "Employee GET /api/customers is Allowed (200)");

    // Employee CAN create a customer
    const empCreateCust = await request("/api/customers/create", {
      method: "POST",
      headers: { Authorization: `Bearer ${employeeAccessToken}` },
      body: {
        fullName: "Test Customer Emp Created",
        phone: `91000${Math.floor(10000 + Math.random() * 90000)}`,
        address: "123 Business Way",
        customerType: "commercial",
      },
    });
    assert(empCreateCust.status === 201 || empCreateCust.status === 200, "Employee POST /api/customers/create is Allowed (201/200)");
    createdCustomerId = empCreateCust.body.customer?._id || empCreateCust.body.data?._id;

    // Employee CANNOT edit existing customer (PUT rejected with 403)
    const empPutCust = await request(`/api/customers/${createdCustomerId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${employeeAccessToken}` },
      body: { fullName: "Tampered Name" },
    });
    assert(empPutCust.status === 403, "Employee PUT /api/customers/:id is Rejected with 403 Forbidden");

    // Employee CANNOT delete existing customer (DELETE rejected with 403)
    const empDeleteCust = await request(`/api/customers/${createdCustomerId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${employeeAccessToken}` },
    });
    assert(empDeleteCust.status === 403, "Employee DELETE /api/customers/:id is Rejected with 403 Forbidden");

    // Admin CAN edit and delete customer
    const adminPutCust = await request(`/api/customers/${createdCustomerId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${adminAccessToken}` },
      body: { fullName: "Admin Updated Customer" },
    });
    assert(adminPutCust.status === 200, "Admin PUT /api/customers/:id is Allowed (200)");

    // 5b. HR Module Protection (STRICT)
    // Employee accessing /api/employees is BLOCKED with 403
    const empGetEmployees = await request("/api/employees", {
      headers: { Authorization: `Bearer ${employeeAccessToken}` },
    });
    assert(empGetEmployees.status === 403, "Employee GET /api/employees is Strictly Blocked with 403 Forbidden");

    // Employee accessing /api/attendance is BLOCKED with 403
    const empGetAttendance = await request("/api/attendance/month", {
      headers: { Authorization: `Bearer ${employeeAccessToken}` },
    });
    assert(empGetAttendance.status === 403, "Employee GET /api/attendance/month is Strictly Blocked with 403 Forbidden");

    // Admin accessing /api/employees is ALLOWED
    const adminGetEmployees = await request("/api/employees", {
      headers: { Authorization: `Bearer ${adminAccessToken}` },
    });
    assert(adminGetEmployees.status === 200, "Admin GET /api/employees is Allowed (200)");

    // 5c. Invoices, Quotations, Renewals Mutation Protection
    const empPutInvoice = await request("/api/invoices/6a1596f77d65d1bccf62c339", {
      method: "PUT",
      headers: { Authorization: `Bearer ${employeeAccessToken}` },
      body: { notes: "tampered" },
    });
    assert(empPutInvoice.status === 403, "Employee PUT /api/invoices/:id is Rejected with 403 Forbidden");

    const empDeleteInvoice = await request("/api/invoices/6a1596f77d65d1bccf62c339", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${employeeAccessToken}` },
    });
    assert(empDeleteInvoice.status === 403, "Employee DELETE /api/invoices/:id is Rejected with 403 Forbidden");

    const empPutQuotation = await request("/api/quotations/6a1596f77d65d1bccf62c339", {
      method: "PUT",
      headers: { Authorization: `Bearer ${employeeAccessToken}` },
      body: { notes: "tampered" },
    });
    assert(empPutQuotation.status === 403, "Employee PUT /api/quotations/:id is Rejected with 403 Forbidden");

    const empPutRenewal = await request("/api/renewals/6a1596f77d65d1bccf62c339", {
      method: "PUT",
      headers: { Authorization: `Bearer ${employeeAccessToken}` },
      body: { notes: "tampered" },
    });
    assert(empPutRenewal.status === 403, "Employee PUT /api/renewals/:id is Rejected with 403 Forbidden");

    // 5d. Company Settings & Job Numbers Sync
    const empPutSettings = await request("/api/company-settings", {
      method: "PUT",
      headers: { Authorization: `Bearer ${employeeAccessToken}` },
      body: { companyName: "Hacked SPM" },
    });
    assert(empPutSettings.status === 403, "Employee PUT /api/company-settings is Rejected with 403 Forbidden");

    const empSyncJobNumbers = await request("/api/job-numbers/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${employeeAccessToken}` },
    });
    assert(empSyncJobNumbers.status === 403, "Employee POST /api/job-numbers/sync is Rejected with 403 Forbidden");

    // 5e. Admin User Management Endpoint Protection
    const empGetUsers = await request("/api/admin/users", {
      headers: { Authorization: `Bearer ${employeeAccessToken}` },
    });
    assert(empGetUsers.status === 403, "Employee GET /api/admin/users is Rejected with 403 Forbidden");

    const adminGetUsers = await request("/api/admin/users", {
      headers: { Authorization: `Bearer ${adminAccessToken}` },
    });
    assert(adminGetUsers.status === 200, "Admin GET /api/admin/users is Allowed (200)");

    // -------------------------------------------------------------
    // Test Group 6: Refresh Token Rotation & Session Revocation
    // -------------------------------------------------------------
    console.log("\n[TEST GROUP 6] Refresh Token Rotation, Reuse Detection & Revocation");

    // 6a. Login fresh to test rotation
    const rotLogin = await request("/api/admin/login", {
      method: "POST",
      body: { email: adminEmail, password: "AdminPassword123!" },
    });
    const firstRefreshToken = rotLogin.cookie?.split(";")[0]?.split("=")[1];
    assert(Boolean(firstRefreshToken), "Initial login issued refreshToken");

    // 6b. First Refresh: should succeed and rotate token
    const firstRefresh = await request("/api/admin/refresh", {
      method: "POST",
      headers: {
        Cookie: `refreshToken=${firstRefreshToken}`,
      },
      body: { refreshToken: firstRefreshToken },
    });
    assert(firstRefresh.status === 200, "Token refresh succeeded (200)");
    const secondRefreshToken = firstRefresh.cookie?.split(";")[0]?.split("=")[1];
    assert(Boolean(secondRefreshToken) && secondRefreshToken !== firstRefreshToken, "Refresh rotated to a new refreshToken");

    // 6c. TOKEN REUSE DETECTION: Presenting the already-consumed firstRefreshToken
    const reuseAttempt = await request("/api/admin/refresh", {
      method: "POST",
      headers: {
        Cookie: `refreshToken=${firstRefreshToken}`,
      },
      body: { refreshToken: firstRefreshToken },
    });
    assert(reuseAttempt.status === 401, "Reusing old refreshToken is REJECTED with 401");
    assert(reuseAttempt.body.message.includes("Token reuse detected"), "Server flags token reuse alert");

    // Verify user's session was revoked by tokenVersion increment
    const userAfterReuse = await Admin.findById(testAdminId);
    assert(userAfterReuse.tokenVersion > 0, "User tokenVersion incremented to invalidate all sessions");

    // 6d. Role Change Revocation: Admin changes employee role -> employee's active token is immediately invalidated
    const empFreshLogin = await request("/api/admin/login", {
      method: "POST",
      body: { email: employeeEmail, password: "EmployeePassword123!" },
    });
    const empActiveToken = empFreshLogin.body.accessToken;

    // Verify token works initially
    const empWorkingCheck = await request("/api/customers", {
      headers: { Authorization: `Bearer ${empActiveToken}` },
    });
    assert(empWorkingCheck.status === 200, "Employee token works prior to role change");

    // Admin logs in fresh following token reuse test
    const freshAdminLogin = await request("/api/admin/login", {
      method: "POST",
      body: { email: adminEmail, password: "AdminPassword123!" },
    });
    const freshAdminToken = freshAdminLogin.body.accessToken;

    // Admin promotes Employee to Admin
    const promoteRes = await request(`/api/admin/users/${testEmployeeId}/role`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${freshAdminToken}` },
      body: { role: "admin" },
    });
    assert(promoteRes.status === 200, "Admin can promote user role");

    // Employee's previous active token must now be rejected because tokenVersion changed!
    const empRevokedCheck = await request("/api/customers", {
      headers: { Authorization: `Bearer ${empActiveToken}` },
    });
    assert(empRevokedCheck.status === 401, "Old employee token immediately revoked upon role change (401)");

    // -------------------------------------------------------------
    // Test Group 7: Audit Logging
    // -------------------------------------------------------------
    console.log("\n[TEST GROUP 7] Security Audit Logging");
    const auditLogs = await AuditLog.find({ userId: { $in: [testAdminId, testEmployeeId] } }).sort({ createdAt: -1 });
    assert(auditLogs.length > 0, `Recorded ${auditLogs.length} audit logs for test actions`);
    
    const actionsRecorded = auditLogs.map((l) => l.action);
    console.log("  Audit Actions recorded:", Array.from(new Set(actionsRecorded)).join(", "));
    assert(actionsRecorded.includes("LOGIN_SUCCESS"), "LOGIN_SUCCESS logged");
    assert(actionsRecorded.includes("ROLE_CHANGED"), "ROLE_CHANGED logged");
    assert(
      actionsRecorded.includes("EMPLOYEE_MUTATION_BLOCKED") ||
      actionsRecorded.includes("EMPLOYEE_HR_ACCESS_BLOCKED") ||
      actionsRecorded.includes("ACCESS_DENIED_ADMIN_REQUIRED"),
      "Authorization violations logged"
    );

  } catch (error) {
    console.error("Test Suite Runtime Error:", error);
    testFails.push(`Runtime error: ${error.message}`);
  } finally {
    // Cleanup test users and test entities
    for (const id of createdUserIds) {
      try {
        await Admin.findByIdAndDelete(id);
      } catch (e) {}
    }
    if (createdCustomerId) {
      try {
        await mongoose.connection.collection("customers").deleteOne({ _id: new mongoose.Types.ObjectId(createdCustomerId) });
      } catch (e) {}
    }
    console.log(`\nCleaned up ${createdUserIds.length} test user accounts and test records.`);

    if (server) {
      await new Promise((resolve) => server.close(resolve));
      console.log("Test server stopped.");
    }
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");

    console.log("\n================================================================");
    console.log(`TEST RESULTS: ${testPasses.length} PASSED, ${testFails.length} FAILED`);
    console.log("================================================================");

    if (testFails.length > 0) {
      console.error("Failed Tests:\n - " + testFails.join("\n - "));
      process.exit(1);
    } else {
      console.log("ALL TESTS COMPLETED SUCCESSFULLY!");
      process.exit(0);
    }
  }
}

runTests();
