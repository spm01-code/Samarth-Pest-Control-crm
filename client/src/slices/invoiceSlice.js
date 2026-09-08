import {
  createSlice,
  createAsyncThunk,
} from "@reduxjs/toolkit";

import {
  createInvoiceAPI,
  fetchInvoicesAPI,
  fetchInvoiceByIdAPI,
  updateInvoiceAPI,
  deleteInvoiceAPI,
} from "../API/invoiceAPI";

// =====================
// Create Invoice
// =====================


export const createInvoice =
  createAsyncThunk(
    "invoice/createInvoice",
    async (
      invoiceData,
      { getState, rejectWithValue }
    ) => {
      try {
        const token =
          getState().auth.token;

        return await createInvoiceAPI(
          invoiceData,
          token
        );
      } catch (error) {
        return rejectWithValue(
          error.message
        );
      }
    }
  );

// =====================
// Get All Invoices
// =====================

export const fetchInvoices =
  createAsyncThunk(
    "invoice/fetchInvoices",
    async (_, { getState, rejectWithValue }) => {
      try {
        const token =
          getState().auth.token;

        return await fetchInvoicesAPI(
          token
        );
      } catch (error) {
        return rejectWithValue(
          error.message
        );
      }
    }
  );

// =====================
// Get Invoice By Id
// =====================

export const fetchInvoiceById =
  createAsyncThunk(
    "invoice/fetchInvoiceById",
    async (
      id,
      { getState, rejectWithValue }
    ) => {
      try {
        const token =
          getState().auth.token;

        return await fetchInvoiceByIdAPI(
          id,
          token
        );
      } catch (error) {
        return rejectWithValue(
          error.message
        );
      }
    }
  );

// =====================
// Update Invoice
// =====================

export const updateInvoice =
  createAsyncThunk(
    "invoice/updateInvoice",
    async (
      { id, invoiceData },
      { getState, rejectWithValue }
    ) => {
      try {
        const token =
          getState().auth.token;

        return await updateInvoiceAPI(
          id,
          invoiceData,
          token
        );
      } catch (error) {
        return rejectWithValue(
          error.message
        );
      }
    }
  );

// =====================
// Delete Invoice
// =====================

export const deleteInvoice =
  createAsyncThunk(
    "invoice/deleteInvoice",
    async (
      id,
      { getState, rejectWithValue }
    ) => {
      try {
        const token =
          getState().auth.token;

        await deleteInvoiceAPI(
          id,
          token
        );

        return id;
      } catch (error) {
        return rejectWithValue(
          error.message
        );
      }
    }
  );

const invoiceSlice = createSlice({
  name: "invoice",

  initialState: {
    invoices: [],
    invoice: null,
    loading: false,
    error: null,
  },

  reducers: {
    clearInvoiceError: (state) => {
      state.error = null;
    },

    clearSelectedInvoice: (
      state
    ) => {
      state.invoice = null;
    },
  },

  extraReducers: (builder) => {
    builder

      // =====================
      // Create Invoice
      // =====================

      .addCase(
        createInvoice.pending,
        (state) => {
          state.loading = true;
          state.error = null;
        }
      )

      .addCase(
        createInvoice.fulfilled,
        (state, action) => {
          state.loading = false;

          state.invoices.unshift(
            action.payload.invoice
          );
        }
      )

      .addCase(
        createInvoice.rejected,
        (state, action) => {
          state.loading = false;
          state.error = action.payload;
        }
      )

      // =====================
      // Fetch Invoices
      // =====================

      .addCase(
        fetchInvoices.pending,
        (state) => {
          state.loading = true;
          state.error = null;
        }
      )

      .addCase(
        fetchInvoices.fulfilled,
        (state, action) => {
          state.loading = false;
          state.invoices =
            action.payload.invoices;
        }
      )

      .addCase(
        fetchInvoices.rejected,
        (state, action) => {
          state.loading = false;
          state.error = action.payload;
        }
      )

      // =====================
      // Fetch Invoice By Id
      // =====================

      .addCase(
        fetchInvoiceById.pending,
        (state) => {
          state.loading = true;
          state.error = null;
        }
      )

      .addCase(
        fetchInvoiceById.fulfilled,
        (state, action) => {
          state.loading = false;
          state.invoice =
            action.payload.invoice;
        }
      )

      .addCase(
        fetchInvoiceById.rejected,
        (state, action) => {
          state.loading = false;
          state.error = action.payload;
        }
      )

      // =====================
      // Update Invoice
      // =====================

      .addCase(
        updateInvoice.pending,
        (state) => {
          state.loading = true;
          state.error = null;
        }
      )

      .addCase(
        updateInvoice.fulfilled,
        (state, action) => {
          state.loading = false;

          const updatedInvoice =
            action.payload.invoice;

          state.invoice =
            updatedInvoice;

          state.invoices =
            state.invoices.map((invoice) =>
              invoice._id ===
              updatedInvoice._id
                ? updatedInvoice
                : invoice
            );
        }
      )

      .addCase(
        updateInvoice.rejected,
        (state, action) => {
          state.loading = false;
          state.error = action.payload;
        }
      )

      // =====================
      // Delete Invoice
      // =====================

      .addCase(
        deleteInvoice.pending,
        (state) => {
          state.loading = true;
          state.error = null;
        }
      )

      .addCase(
        deleteInvoice.fulfilled,
        (state, action) => {
          state.loading = false;

          state.invoices =
            state.invoices.filter(
              (invoice) =>
                invoice._id !==
                action.payload
            );
        }
      )

      .addCase(
        deleteInvoice.rejected,
        (state, action) => {
          state.loading = false;
          state.error = action.payload;
        }
      );
  },
});

export const {
  clearInvoiceError,
  clearSelectedInvoice,
} = invoiceSlice.actions;

export default invoiceSlice.reducer;
