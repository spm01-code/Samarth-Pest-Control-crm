import express from "express"
import {
  registerAdmin,
  verifyOTP,
  loginAdmin,
  refreshAdminToken,
  updateAdmin,
  deleteAdmin,
} from "../controller/adminController.js"
import authMiddleware from "../middleware/authMiddleware.js"

const router = express.Router()

router.post("/register", registerAdmin)
router.post("/verifyotp", verifyOTP)
router.post("/login", loginAdmin)
router.post("/refresh", refreshAdminToken)
router.put("/:id", authMiddleware, updateAdmin)
router.delete("/:id", authMiddleware, deleteAdmin)

export default router
