import { useState, forwardRef } from "react";
import { HiOutlineEye, HiOutlineEyeSlash } from "react-icons/hi2";

const PasswordInput = forwardRef(function PasswordInput(
  { className = "", containerClassName = "", ...props },
  ref
) {
  const [showPassword, setShowPassword] = useState(false);

  const togglePasswordVisibility = (e) => {
    e.preventDefault();
    setShowPassword((prev) => !prev);
  };

  return (
    <div className={`relative w-full ${containerClassName}`}>
      <input
        {...props}
        ref={ref}
        type={showPassword ? "text" : "password"}
        className={`${className} pr-11`}
      />
      <button
        type="button"
        onClick={togglePasswordVisibility}
        disabled={props.disabled}
        aria-label={showPassword ? "Hide password" : "Show password"}
        aria-pressed={showPassword}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded p-1 transition flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {showPassword ? (
          <HiOutlineEyeSlash className="w-5 h-5 text-slate-500" aria-hidden="true" />
        ) : (
          <HiOutlineEye className="w-5 h-5 text-slate-500" aria-hidden="true" />
        )}
      </button>
    </div>
  );
});

export default PasswordInput;
