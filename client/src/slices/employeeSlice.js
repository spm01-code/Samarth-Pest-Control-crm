import {
  createSlice,
  createAsyncThunk,
} from "@reduxjs/toolkit";

import {
  fetchEmployeesAPI,
  fetchEmployeeAPI,
  createEmployeeAPI,
  updateEmployeeAPI,
  deleteEmployeeAPI,
} from "../API/employeesAPI";

// FETCH ALL EMPLOYEES
export const fetchEmployees = createAsyncThunk(
  "employee/fetchEmployees",
  async (_, thunkAPI) => {
    try {
      const token = thunkAPI.getState().auth.token;

      return await fetchEmployeesAPI(token);
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  }
);

// FETCH SINGLE EMPLOYEE
export const fetchEmployee = createAsyncThunk(
  "employee/fetchEmployee",
  async (id, thunkAPI) => {
    try {
      const token = thunkAPI.getState().auth.token;

      return await fetchEmployeeAPI(id, token);
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  }
);

// CREATE EMPLOYEE
export const createEmployee = createAsyncThunk(
  "employee/createEmployee",
  async (employeeData, thunkAPI) => {
    try {
      const token = thunkAPI.getState().auth.token;

      return await createEmployeeAPI(
        employeeData,
        token
      );
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  }
);

// UPDATE EMPLOYEE
export const updateEmployee = createAsyncThunk(
  "employee/updateEmployee",
  async ({ id, employeeData }, thunkAPI) => {
    try {
      const token = thunkAPI.getState().auth.token;

      return await updateEmployeeAPI(
        id,
        employeeData,
        token
      );
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  }
);

// DELETE EMPLOYEE
export const deleteEmployee = createAsyncThunk(
  "employee/deleteEmployee",
  async (id, thunkAPI) => {
    try {
      const token = thunkAPI.getState().auth.token;

      await deleteEmployeeAPI(id, token);

      return id;
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message);
    }
  }
);

const employeeSlice = createSlice({
  name: "employee",

  initialState: {
    employees: [],
    employee: null,
    loading: false,
    error: null,
  },

  reducers: {},

  extraReducers: (builder) => {
    builder

      // FETCH ALL
      .addCase(fetchEmployees.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(
        fetchEmployees.fulfilled,
        (state, action) => {
          state.loading = false;
          state.employees = action.payload;
        }
      )
      .addCase(
        fetchEmployees.rejected,
        (state, action) => {
          state.loading = false;
          state.error = action.payload;
        }
      )

      // FETCH SINGLE
      .addCase(fetchEmployee.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(
        fetchEmployee.fulfilled,
        (state, action) => {
          state.loading = false;
          state.employee = action.payload;
        }
      )
      .addCase(
        fetchEmployee.rejected,
        (state, action) => {
          state.loading = false;
          state.error = action.payload;
        }
      )

      // CREATE
      .addCase(
        createEmployee.fulfilled,
        (state, action) => {
          state.employees.push(
            action.payload.employee
          );
        }
      )

      // UPDATE
      .addCase(
        updateEmployee.fulfilled,
        (state, action) => {
          const updatedEmployee =
            action.payload.employee;

          const index =
            state.employees.findIndex(
              (emp) =>
                emp._id === updatedEmployee._id
            );

          if (index !== -1) {
            state.employees[index] =
              updatedEmployee;
          }

          state.employee =
            updatedEmployee;
        }
      )

      // DELETE
      .addCase(
        deleteEmployee.fulfilled,
        (state, action) => {
          state.employees =
            state.employees.filter(
              (emp) =>
                emp._id !== action.payload
            );

          if (
            state.employee?._id ===
            action.payload
          ) {
            state.employee = null;
          }
        }
      );
  },
});

export default employeeSlice.reducer;