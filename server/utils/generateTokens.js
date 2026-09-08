import jwt from "jsonwebtoken";

export const generateAccessToken = (adminId) => {
  if (!process.env.ACCESS_TOKEN_SECRET) {
    throw new Error("ACCESS_TOKEN_SECRET must be set in server/.env");
  }

  return jwt.sign(
    { adminId },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: "30d",
    }
  );
};

export const generateRefreshToken = (adminId) => {
  if (!process.env.REFRESH_TOKEN_SECRET) {
    throw new Error("REFRESH_TOKEN_SECRET must be set in server/.env");
  }

  return jwt.sign(
    { adminId },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: "30d",
    }
  );
};
