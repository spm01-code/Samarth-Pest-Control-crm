import jwt from "jsonwebtoken";
import Admin from "../model/adminModel.js";

const authMiddleware = async (req, res, next) => {
  try {
    let token;

    // Get token from headers or query
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.query.token) {
      token = req.query.token;
    }

    // No token
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. No token provided",
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const userId = decoded.adminId || decoded.id;

    // Find user in database
    const user = await Admin.findById(userId).select("-password -refreshToken -refreshTokenHash");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found",
      });
    }

    // Check if account is active
    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: "Account has been deactivated. Please contact an administrator.",
      });
    }

    // Check token version for immediate revocation on role change / password change / admin revoke
    if (
      decoded.tokenVersion !== undefined &&
      user.tokenVersion !== undefined &&
      decoded.tokenVersion !== user.tokenVersion
    ) {
      return res.status(401).json({
        success: false,
        message: "Session revoked or role changed. Please log in again.",
      });
    }

    // Attach user to request
    req.user = user;
    req.admin = user; // Backward compatibility

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Access token expired",
      });
    }
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

export default authMiddleware;
