import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

import {
  fetchServicesAPI,
  fetchServiceAPI,
  createServiceAPI,
  updateServiceAPI,
  deleteServiceAPI,
} from "../API/serviceAPI";
import { refreshSession } from "./authSlice";

const isExpiredTokenError = (error) =>
  error.message === "Invalid or expired token";

const withFreshToken = async (thunkAPI, request) => {
  try {
    return await request(thunkAPI.getState().auth.token);
  } catch (error) {
    if (!isExpiredTokenError(error)) {
      throw error;
    }

    const refreshedSession = await thunkAPI.dispatch(refreshSession()).unwrap();

    return await request(refreshedSession.accessToken);
  }
};

// Get All Services
export const fetchServices = createAsyncThunk(
  "services/fetchServices",
  async (_, thunkAPI) => {
    try {
      return await withFreshToken(thunkAPI, fetchServicesAPI);
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  },
);

// Get Single Service
export const fetchService = createAsyncThunk(
  "services/fetchService",
  async (id, thunkAPI) => {
    try {
      return await withFreshToken(thunkAPI, (token) =>
        fetchServiceAPI(id, token),
      );
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  },
);

// Create Service
export const createService = createAsyncThunk(
  "services/createService",
  async (serviceData, thunkAPI) => {
    try {
      return await withFreshToken(thunkAPI, (token) =>
        createServiceAPI(serviceData, token),
      );
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  },
);

// Update Service
export const updateService = createAsyncThunk(
  "services/updateService",
  async ({ id, serviceData }, thunkAPI) => {
    try {
      return await withFreshToken(thunkAPI, (token) =>
        updateServiceAPI(id, serviceData, token),
      );
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  },
);

// Delete Service
export const deleteService = createAsyncThunk(
  "services/deleteService",
  async (id, thunkAPI) => {
    try {
      await withFreshToken(thunkAPI, (token) => deleteServiceAPI(id, token));
      return id;
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  },
);

const serviceSlice = createSlice({
  name: "services",
  initialState: {
    services: [],
    service: null,
    loading: false,
    error: null,
  },

  reducers: {},

  extraReducers: (builder) => {
    builder

      // Fetch All
      .addCase(fetchServices.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchServices.fulfilled, (state, action) => {
        state.loading = false;
        state.services = Array.isArray(action.payload)
          ? action.payload
          : action.payload.services || [];
        state.error = null;
      })
      .addCase(fetchServices.rejected, (state, action) => {
        state.loading = false;
        state.services = [];
        state.error = action.payload;
      })

      // Fetch One
      .addCase(fetchService.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchService.fulfilled, (state, action) => {
        state.loading = false;
        state.service = action.payload;
        state.error = null;
      })
      .addCase(fetchService.rejected, (state, action) => {
        state.loading = false;
        state.service = null;
        state.error = action.payload;
      })

      // Create
      .addCase(createService.fulfilled, (state, action) => {
        state.services.push(action.payload.service);
      })

      // Update
      .addCase(updateService.fulfilled, (state, action) => {
        const updatedService = action.payload.service;

        const index = state.services.findIndex(
          (service) => service._id === updatedService._id,
        );

        if (index !== -1) {
          state.services[index] = updatedService;
        }

        state.service = updatedService;
      })

      // Delete
      .addCase(deleteService.fulfilled, (state, action) => {
        state.services = state.services.filter(
          (service) => service._id !== action.payload,
        );
      });
  },
});

export default serviceSlice.reducer;
