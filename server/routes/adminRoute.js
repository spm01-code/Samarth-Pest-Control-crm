import express from "express"
import {
  registerAdmin,
  verifyOTP,
  resendOTP,
  loginAdmin,
  refreshAdminToken,
  requestPasswordChangeOTP,
  verifyPasswordChange,
  updateAdmin,
  deleteAdmin,
} from "../controller/adminController.js"
import authMiddleware from "../middleware/authMiddleware.js"

const router = express.Router()

router.post("/register", registerAdmin)
router.post("/verifyotp", verifyOTP)
router.post("/resend-otp", resendOTP)
router.post("/login", loginAdmin)
router.post("/refresh", refreshAdminToken)
router.post("/change-password/request-otp", authMiddleware, requestPasswordChangeOTP)
router.post("/change-password/verify", authMiddleware, verifyPasswordChange)
router.put("/:id", authMiddleware, updateAdmin)
router.delete("/:id", authMiddleware, deleteAdmin)

export default router

