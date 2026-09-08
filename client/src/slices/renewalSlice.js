import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { createRenewalAPI, deleteRenewalAPI, fetchRenewalByIdAPI, fetchRenewalsAPI, updateRenewalAPI } from "../API/renewalAPI";

const call = (api) => async (value, thunkAPI) => {
  try { return await api(value, thunkAPI.getState().auth.token); }
  catch (error) { return thunkAPI.rejectWithValue(error.message); }
};

export const createRenewal = createAsyncThunk("renewal/create", call((data, token) => createRenewalAPI(data, token)));
export const fetchRenewals = createAsyncThunk("renewal/list", call((_, token) => fetchRenewalsAPI(token)));
export const fetchRenewalById = createAsyncThunk("renewal/get", call((id, token) => fetchRenewalByIdAPI(id, token)));
export const updateRenewal = createAsyncThunk("renewal/update", call(({ id, data }, token) => updateRenewalAPI(id, data, token)));
export const deleteRenewal = createAsyncThunk("renewal/delete", call((id, token) => deleteRenewalAPI(id, token)));

const initialState = { renewals: [], renewal: null, loading: false, error: null };
const start = (state) => { state.loading = true; state.error = null; };
const fail = (state, action) => { state.loading = false; state.error = action.payload; };

const renewalSlice = createSlice({
  name: "renewal", initialState, reducers: {},
  extraReducers: (builder) => builder
    .addCase(createRenewal.pending, start).addCase(createRenewal.rejected, fail)
    .addCase(createRenewal.fulfilled, (state, action) => { state.loading = false; state.renewals.unshift(action.payload.renewal); })
    .addCase(fetchRenewals.pending, start).addCase(fetchRenewals.rejected, fail)
    .addCase(fetchRenewals.fulfilled, (state, action) => { state.loading = false; state.renewals = action.payload.renewals; })
    .addCase(fetchRenewalById.pending, start).addCase(fetchRenewalById.rejected, fail)
    .addCase(fetchRenewalById.fulfilled, (state, action) => { state.loading = false; state.renewal = action.payload.renewal; })
    .addCase(updateRenewal.pending, start).addCase(updateRenewal.rejected, fail)
    .addCase(updateRenewal.fulfilled, (state, action) => { state.loading = false; state.renewal = action.payload.renewal; state.renewals = state.renewals.map((item) => item._id === action.payload.renewal._id ? action.payload.renewal : item); })
    .addCase(deleteRenewal.pending, start).addCase(deleteRenewal.rejected, fail)
    .addCase(deleteRenewal.fulfilled, (state, action) => { state.loading = false; state.renewals = state.renewals.filter((item) => item._id !== action.meta.arg); }),
});
export default renewalSlice.reducer;
