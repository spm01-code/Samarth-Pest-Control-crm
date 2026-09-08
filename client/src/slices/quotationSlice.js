import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

import {
  createQuotationAPI,
  fetchQuotationsAPI,
  fetchQuotationByIdAPI,
  fetchCustomerQuotationsAPI,
  updateQuotationAPI,
  deleteQuotationAPI,
} from "../API/quotationAPI";

const initialState = {
  quotations: [],
  quotation: null,
  loading: false,
  error: null,
};

// Create Quotation
export const createQuotation = createAsyncThunk(
  "quotation/createQuotation",
  async (quotationData, thunkAPI) => {
    try {
      const token = thunkAPI.getState().auth.token;

      return await createQuotationAPI(quotationData, token);
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  },
);

// Fetch All Quotations
export const fetchQuotations = createAsyncThunk(
  "quotation/fetchQuotations",
  async (_, thunkAPI) => {
    try {
      const token = thunkAPI.getState().auth.token;

      return await fetchQuotationsAPI(token);
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  },
);

// Fetch Single Quotation
export const fetchQuotationById = createAsyncThunk(
  "quotation/fetchQuotationById",
  async (id, thunkAPI) => {
    try {
      const token = thunkAPI.getState().auth.token;

      return await fetchQuotationByIdAPI(id, token);
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  },
);

// Fetch Customer Quotations
export const fetchCustomerQuotations = createAsyncThunk(
  "quotation/fetchCustomerQuotations",
  async (customerId, thunkAPI) => {
    try {
      const token = thunkAPI.getState().auth.token;

      return await fetchCustomerQuotationsAPI(customerId, token);
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  },
);

// Update Quotation
export const updateQuotation = createAsyncThunk(
  "quotation/updateQuotation",
  async ({ id, quotationData }, thunkAPI) => {
    try {
      const token = thunkAPI.getState().auth.token;

      return await updateQuotationAPI(id, quotationData, token);
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  },
);

// Delete Quotation
export const deleteQuotation = createAsyncThunk(
  "quotation/deleteQuotation",
  async (id, thunkAPI) => {
    try {
      const token = thunkAPI.getState().auth.token;

      await deleteQuotationAPI(id, token);

      return id;
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  },
);

const quotationSlice = createSlice({
  name: "quotation",

  initialState,

  reducers: {},

  extraReducers: (builder) => {
    builder

      // Create
      .addCase(createQuotation.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createQuotation.fulfilled, (state, action) => {
        state.loading = false;
        state.quotations.unshift(action.payload.quotation);
      })
      .addCase(createQuotation.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Fetch All
      .addCase(fetchQuotations.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchQuotations.fulfilled, (state, action) => {
        state.loading = false;
        state.quotations = action.payload.quotations;
      })
      .addCase(fetchQuotations.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Fetch One
      .addCase(fetchQuotationById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchQuotationById.fulfilled, (state, action) => {
        state.loading = false;
        state.quotation = action.payload.quotation;
      })
      .addCase(fetchQuotationById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Fetch Customer Quotations
      .addCase(fetchCustomerQuotations.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCustomerQuotations.fulfilled, (state, action) => {
        state.loading = false;
        state.quotations = action.payload.quotations;
      })
      .addCase(fetchCustomerQuotations.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Update
      .addCase(updateQuotation.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateQuotation.fulfilled, (state, action) => {
        state.loading = false;

        const index = state.quotations.findIndex(
          (quotation) => quotation._id === action.payload.quotation._id,
        );

        if (index !== -1) {
          state.quotations[index] = action.payload.quotation;
        }

        state.quotation = action.payload.quotation;
      })
      .addCase(updateQuotation.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Delete
      .addCase(deleteQuotation.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteQuotation.fulfilled, (state, action) => {
        state.loading = false;

        state.quotations = state.quotations.filter(
          (quotation) => quotation._id !== action.payload,
        );
      })
      .addCase(deleteQuotation.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export default quotationSlice.reducer;
