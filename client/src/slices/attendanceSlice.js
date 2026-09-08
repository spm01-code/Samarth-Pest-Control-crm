import {
  createSlice,
  createAsyncThunk,
} from "@reduxjs/toolkit";

import {
  fetchAttendanceByDateAPI,
  markAttendanceAPI,
  fetchEmployeeAttendanceAPI,
  fetchMonthlyAttendanceAPI,
} from "../API/attendanceAPI";

// FETCH ATTENDANCE BY DATE
export const fetchAttendanceByDate = createAsyncThunk(
  "attendance/fetchAttendanceByDate",
  async (date, thunkAPI) => {
    try {
      const token = thunkAPI.getState().auth.token;

      return await fetchAttendanceByDateAPI(date, token);
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  }
);

// MARK OR UPDATE ATTENDANCE
export const markAttendance = createAsyncThunk(
  "attendance/markAttendance",
  async (attendanceData, thunkAPI) => {
    try {
      const token = thunkAPI.getState().auth.token;

      return await markAttendanceAPI(attendanceData, token);
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  }
);

// FETCH EMPLOYEE ATTENDANCE HISTORY
export const fetchEmployeeAttendance = createAsyncThunk(
  "attendance/fetchEmployeeAttendance",
  async (employeeId, thunkAPI) => {
    try {
      const token = thunkAPI.getState().auth.token;

      return await fetchEmployeeAttendanceAPI(
        employeeId,
        token
      );
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  }
);

// FETCH MONTHLY ATTENDANCE
export const fetchMonthlyAttendance = createAsyncThunk(
  "attendance/fetchMonthlyAttendance",
  async ({ month, year }, thunkAPI) => {
    try {
      const token = thunkAPI.getState().auth.token;

      return await fetchMonthlyAttendanceAPI(
        month,
        year,
        token
      );
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  }
);

const attendanceSlice = createSlice({
  name: "attendance",

  initialState: {
    employees: [],
    attendance: [],
    employeeAttendance: [],
    monthlyAttendance: [],
    summary: {
      totalEmployees: 0,
      present: 0,
      absent: 0,
      leave: 0,
      halfDay: 0,
    },
    exists: false,
    editable: true,
    loading: false,
    saving: false,
    error: null,
    success: null,
  },

  reducers: {
    clearAttendanceMessage: (state) => {
      state.error = null;
      state.success = null;
    },
  },

  extraReducers: (builder) => {
    builder

      // FETCH BY DATE
      .addCase(fetchAttendanceByDate.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.success = null;
      })
      .addCase(
        fetchAttendanceByDate.fulfilled,
        (state, action) => {
          state.loading = false;
          state.employees = action.payload.employees || [];
          state.attendance = action.payload.attendance || [];
          state.summary = action.payload.summary;
          state.exists = action.payload.exists;
          state.editable = action.payload.editable;
        }
      )
      .addCase(
        fetchAttendanceByDate.rejected,
        (state, action) => {
          state.loading = false;
          state.error = action.payload;
        }
      )

      // MARK OR UPDATE
      .addCase(markAttendance.pending, (state) => {
        state.saving = true;
        state.error = null;
        state.success = null;
      })
      .addCase(markAttendance.fulfilled, (state, action) => {
        state.saving = false;
        state.attendance = action.payload.attendance || [];
        state.summary = action.payload.summary;
        state.exists = true;
        state.success = action.payload.message;
      })
      .addCase(markAttendance.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload;
      })

      // EMPLOYEE HISTORY
      .addCase(
        fetchEmployeeAttendance.fulfilled,
        (state, action) => {
          state.employeeAttendance = action.payload;
        }
      )

      // MONTHLY ATTENDANCE
      .addCase(
        fetchMonthlyAttendance.fulfilled,
        (state, action) => {
          state.monthlyAttendance = action.payload;
        }
      );
  },
});

export const { clearAttendanceMessage } =
  attendanceSlice.actions;

export default attendanceSlice.reducer;
