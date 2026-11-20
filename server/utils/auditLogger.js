import AuditLog from "../model/auditLogModel.js";

/**
 * Log a sensitive CRM action for auditing purposes.
 * Pass request details, actor, action, module, targetId and metadata.
 * Strips any sensitive fields before persisting.
 */
export const logAuditEvent = async ({
  req = null,
  userId = null,
  userEmail = null,
  userRole = "anonymous",
  action,
  module,
  targetId = null,
  details = {},
  status = "SUCCESS",
}) => {
  try {
    const actorId = userId || (req?.user?._id || req?.admin?._id) || null;
    const actorEmail = userEmail || (req?.user?.email || req?.admin?.email) || null;
    const actorRole = userRole !== "anonymous" ? userRole : (req?.user?.role || req?.admin?.role || "anonymous");

    // Clean details to ensure NO passwords, tokens, secrets or OTPs are logged
    const cleanDetails = { ...details };
    const sensitiveKeys = [
      "password",
      "newPassword",
      "currentPassword",
      "confirmPassword",
      "token",
      "accessToken",
      "refreshToken",
      "otp",
      "bootstrapSecret",
      "secret",
    ];

    for (const key of Object.keys(cleanDetails)) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
        cleanDetails[key] = "[REDACTED]";
      }
    }

    const ipAddress = req
      ? req.headers["x-forwarded-for"] || req.socket?.remoteAddress || req.ip || null
      : null;
    const userAgent = req ? req.headers["user-agent"] || null : null;

    await AuditLog.create({
      userId: actorId,
      userEmail: actorEmail,
      userRole: actorRole,
      action,
      module,
      targetId: targetId ? String(targetId) : null,
      details: cleanDetails,
      status,
      ipAddress: typeof ipAddress === "string" ? ipAddress.split(",")[0].trim() : null,
      userAgent: typeof userAgent === "string" ? userAgent.substring(0, 255) : null,
    });
  } catch (error) {
    // Audit logging should never crash the main application request
    console.error(`[Audit Log Error]: ${error.message}`);
  }
};

export default logAuditEvent;
