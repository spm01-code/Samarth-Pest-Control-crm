import express from "express";
import {
  registerAdmin,
  registerSecretAdmin,
  verifyOTP,
  resendOTP,
  loginAdmin,
  loginSecretAdmin,
  refreshAdminToken,
  logoutUser,
  requestPasswordChangeOTP,
  verifyPasswordChange,
  updateAdmin,
  deleteAdmin,
  getAllUsers,
  updateUserRole,
  toggleUserStatus,
  getAuditLogs,
} from "../controller/adminController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { requireAdmin } from "../middleware/rbacMiddleware.js";

const router = express.Router();

// ==========================================
// PUBLIC AUTHENTICATION (EMPLOYEE / DEFAULT)
// ==========================================
router.post("/register", registerAdmin);
router.post("/verifyotp", verifyOTP);
router.post("/resend-otp", resendOTP);
router.post("/login", loginAdmin);
router.post("/refresh", refreshAdminToken);
router.post("/logout", logoutUser);

// ==========================================
// SECRET ADMIN AUTHENTICATION
// ==========================================
router.post("/secure/:secretPath/login", loginSecretAdmin);
router.post("/secure/:secretPath/register", registerSecretAdmin);
router.post("/secure/:secretPath/verifyotp", verifyOTP);

// Direct secret-access path support
const configuredAdminSecret =
  process.env.ADMIN_SECRET_PATH || "6827b866034a1eadadfac16a5b34aa69";

router.post("/:secretPath/login", (req, res, next) => {
  if (
    req.params.secretPath === (process.env.ADMIN_SECRET_PATH || configuredAdminSecret)
  ) {
    return loginSecretAdmin(req, res, next);
  }
  return res.status(404).json({ message: "Route not found" });
});
router.post("/:secretPath/register", (req, res, next) => {
  if (
    req.params.secretPath === (process.env.ADMIN_SECRET_PATH || configuredAdminSecret)
  ) {
    return registerSecretAdmin(req, res, next);
  }
  return res.status(404).json({ message: "Route not found" });
});

// ==========================================
// AUTHENTICATED USER ACTIONS
// ==========================================
router.post("/change-password/request-otp", authMiddleware, requestPasswordChangeOTP);
router.post("/change-password/verify", authMiddleware, verifyPasswordChange);

// ==========================================
// ADMIN USER MANAGEMENT (ADMIN ONLY)
// ==========================================
router.get("/users", authMiddleware, requireAdmin, getAllUsers);
router.patch("/users/:id/role", authMiddleware, requireAdmin, updateUserRole);
router.patch("/users/:id/status", authMiddleware, requireAdmin, toggleUserStatus);
router.get("/audit-logs", authMiddleware, requireAdmin, getAuditLogs);
router.put("/:id", authMiddleware, requireAdmin, updateAdmin);
router.delete("/:id", authMiddleware, requireAdmin, deleteAdmin);

export default router;
