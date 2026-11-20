/**
 * Validates password complexity for user accounts.
 * Enforces at least 8 characters, at least one uppercase letter, one lowercase letter, and one number.
 */
export const validatePasswordStrength = (password) => {
  if (!password || typeof password !== "string") {
    return {
      isValid: false,
      message: "Password is required",
    };
  }

  if (password.length < 8) {
    return {
      isValid: false,
      message: "Password must be at least 8 characters long",
    };
  }

  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  if (!hasUpper || !hasLower || !hasNumber) {
    return {
      isValid: false,
      message: "Password must contain at least one uppercase letter, one lowercase letter, and one number",
    };
  }

  return {
    isValid: true,
  };
};

export default validatePasswordStrength;
