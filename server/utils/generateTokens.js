import jwt from "jsonwebtoken";
import crypto from "crypto";

export const hashToken = (token) => {
  if (!token) return null;
  return crypto.createHash("sha256").update(String(token)).digest("hex");
};

export const generateAccessToken = (userOrId) => {
  if (!process.env.ACCESS_TOKEN_SECRET) {
    throw new Error("ACCESS_TOKEN_SECRET must be set in server/.env");
  }

  const isObject = typeof userOrId === "object" && userOrId !== null;
  const adminId = isObject ? (userOrId._id || userOrId.id) : userOrId;
  const role = isObject ? (userOrId.role || "employee") : "admin";
  const email = isObject ? userOrId.email : undefined;
  const tokenVersion = isObject ? (userOrId.tokenVersion || 0) : 0;

  const payload = {
    adminId,
    id: adminId,
    role,
    email,
    tokenVersion,
  };

  const expiresIn = process.env.ACCESS_TOKEN_EXPIRY || "15m";

  return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn,
  });
};

export const generateRefreshToken = (userOrId) => {
  if (!process.env.REFRESH_TOKEN_SECRET) {
    throw new Error("REFRESH_TOKEN_SECRET must be set in server/.env");
  }

  const isObject = typeof userOrId === "object" && userOrId !== null;
  const adminId = isObject ? (userOrId._id || userOrId.id) : userOrId;
  const role = isObject ? (userOrId.role || "employee") : "admin";
  const tokenVersion = isObject ? (userOrId.tokenVersion || 0) : 0;
  const sessionId = crypto.randomUUID();

  const payload = {
    adminId,
    id: adminId,
    role,
    tokenVersion,
    sessionId,
  };

  const expiresIn = process.env.REFRESH_TOKEN_EXPIRY || "12h";

  return jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn,
  });
};
