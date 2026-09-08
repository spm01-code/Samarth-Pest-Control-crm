import jwt from "jsonwebtoken";
import Admin from "../model/adminModel.js";

const authMiddleware = async (req, res, next) => {
  try {
    let token;

    // Get token from headers
    const authHeader = req.headers.authorization;

    if (
      authHeader &&
      authHeader.startsWith("Bearer ")
    ) {
      token = authHeader.split(" ")[1];
    } else if (req.query.token) {
      token = req.query.token;
    }

    // No token
    if (!token) {
      return res.status(401).json({
        message: "Unauthorized. No token provided",
      });
    }

    // Verify token
    const decoded = jwt.verify(
      token,
      process.env.ACCESS_TOKEN_SECRET
    );

    // Find admin
    const admin = await Admin.findById(
      decoded.adminId
    ).select("-password -refreshToken");

    if (!admin) {
      return res.status(404).json({
        message: "Admin not found",
      });
    }

    // Attach admin to request
    req.admin = admin;

    next();

  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
};

export default authMiddleware;