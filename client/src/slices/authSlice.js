import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import {
  registerUser,
  verifyOTP,
  loginUser,
  refreshAccessToken,
} from "../API/authAPI";

// REGISTER
export const register = createAsyncThunk(
  "auth/register",
  async (data, thunkAPI) => {
    try {
      return await registerUser(data);
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  }
);

// VERIFY OTP
export const verifyOtp = createAsyncThunk(
  "auth/verifyOtp",
  async (data, thunkAPI) => {
    try {
      return await verifyOTP(data);
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  }
);

// LOGIN
export const login = createAsyncThunk(
  "auth/login",
  async (data, thunkAPI) => {
    try {
      return await loginUser(data);
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  }
);

// REFRESH SESSION
export const refreshSession = createAsyncThunk(
  "auth/refreshSession",
  async (_, thunkAPI) => {
    try {
      return await refreshAccessToken();
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  }
);

const authSlice = createSlice({
  name: "auth",

  initialState: {
    user: JSON.parse(localStorage.getItem("admin")) || null,
    token: localStorage.getItem("accessToken") || null,
    loading: false,
    error: null,
    success: false,
  },

  reducers: {
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.success = false;

      localStorage.removeItem("accessToken");
      localStorage.removeItem("admin");
    },

    clearError: (state) => {
      state.error = null;
    },
  },

  extraReducers: (builder) => {
    builder

      // REGISTER
      .addCase(register.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(register.fulfilled, (state) => {
        state.loading = false;
        state.success = true;
      })
      .addCase(register.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // VERIFY OTP
      .addCase(verifyOtp.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(verifyOtp.fulfilled, (state) => {
        state.loading = false;
        state.success = true;
      })
      .addCase(verifyOtp.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // LOGIN
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.success = true;

        state.user = action.payload.admin;
        state.token = action.payload.accessToken;

        localStorage.setItem("accessToken", action.payload.accessToken);
        localStorage.setItem("admin", JSON.stringify(action.payload.admin));
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // REFRESH SESSION
      .addCase(refreshSession.fulfilled, (state, action) => {
        state.user = action.payload.admin;
        state.token = action.payload.accessToken;
        state.error = null;

        localStorage.setItem("accessToken", action.payload.accessToken);
        localStorage.setItem("admin", JSON.stringify(action.payload.admin));
      })
      .addCase(refreshSession.rejected, (state, action) => {
        state.user = null;
        state.token = null;
        state.error = action.payload;

        localStorage.removeItem("accessToken");
        localStorage.removeItem("admin");
      });
  },
});

export const { logout, clearError } = authSlice.actions;

export default authSlice.reducer;
