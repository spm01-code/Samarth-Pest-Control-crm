import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

import {
  getCustomerByID,
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from "../API/customerAPI";
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

    const refreshedSession = await thunkAPI
      .dispatch(refreshSession())
      .unwrap();

    return await request(refreshedSession.accessToken);
  }
};

// GET CUSTOMER BY ID
export const fetchCustomerById = createAsyncThunk(
  "customer/fetchCustomerById",
  async (id, thunkAPI) => {
    try {
      return await withFreshToken(thunkAPI, (token) =>
        getCustomerByID(id, token)
      );
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  }
);

// GET ALL CUSTOMERS
export const fetchCustomers = createAsyncThunk(
  "customer/fetchCustomers",
  async (_, thunkAPI) => {
    try {
      return await withFreshToken(thunkAPI, getCustomers);
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  }
);

// CREATE CUSTOMER
export const addCustomer = createAsyncThunk(
  "customer/addCustomer",
  async (data, thunkAPI) => {
    try {
      return await withFreshToken(thunkAPI, (token) =>
        createCustomer(data, token)
      );
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  }
);

// UPDATE CUSTOMER
export const editCustomer = createAsyncThunk(
  "customer/editCustomer",
  async ({ id, data }, thunkAPI) => {
    try {
      return await withFreshToken(thunkAPI, (token) =>
        updateCustomer(id, data, token)
      );
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  }
);

// DELETE CUSTOMER
export const removeCustomer = createAsyncThunk(
  "customer/removeCustomer",
  async (id, thunkAPI) => {
    try {
      await withFreshToken(thunkAPI, (token) =>
        deleteCustomer(id, token)
      );

      return id;
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  }
);

const customerSlice = createSlice({
  name: "customer",

  initialState: {
    customers: [],
    selectedCustomer: null,
    loading: false,
    error: null,
  },

  reducers: {
    clearSelectedCustomer: (state) => {
      state.selectedCustomer = null;
    },
  },

  extraReducers: (builder) => {
    builder

      // FETCH ALL CUSTOMERS
      .addCase(fetchCustomers.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

      .addCase(fetchCustomers.fulfilled, (state, action) => {
        state.loading = false;

        state.customers = Array.isArray(action.payload)
          ? action.payload
          : action.payload.customers || [];

        state.error = null;
      })

      .addCase(fetchCustomers.rejected, (state, action) => {
        state.loading = false;
        state.customers = [];
        state.error = action.payload;
      })

      // FETCH CUSTOMER BY ID
      .addCase(fetchCustomerById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

      .addCase(fetchCustomerById.fulfilled, (state, action) => {
        state.loading = false;

        state.selectedCustomer =
          action.payload.customer || action.payload;

        state.error = null;
      })

      .addCase(fetchCustomerById.rejected, (state, action) => {
        state.loading = false;
        state.selectedCustomer = null;
        state.error = action.payload;
      })

      // ADD CUSTOMER
      .addCase(addCustomer.fulfilled, (state, action) => {
        const customer =
          action.payload.customer || action.payload;

        state.customers.unshift(customer);
      })

      // UPDATE CUSTOMER
      .addCase(editCustomer.fulfilled, (state, action) => {
        const updatedCustomer =
          action.payload.customer || action.payload;

        state.customers = state.customers.map((customer) =>
          customer._id === updatedCustomer._id
            ? updatedCustomer
            : customer
        );

        if (
          state.selectedCustomer?._id ===
          updatedCustomer._id
        ) {
          state.selectedCustomer = updatedCustomer;
        }
      })

      // DELETE CUSTOMER
      .addCase(removeCustomer.fulfilled, (state, action) => {
        state.customers = state.customers.filter(
          (customer) => customer._id !== action.payload
        );

        if (
          state.selectedCustomer?._id === action.payload
        ) {
          state.selectedCustomer = null;
        }
      });
  },
});

export const { clearSelectedCustomer } =
  customerSlice.actions;

export default customerSlice.reducer;
