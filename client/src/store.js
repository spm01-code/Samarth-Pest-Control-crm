import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./slices/authSlice";
import customerReducer from "./slices/customerSlice"
import serviceReducer from "./slices/serviceSlice"
import employeeReducer from "./slices/employeeSlice"
import invoiceReducer from "./slices/invoiceSlice"
import quotationReducer from "./slices/quotationSlice"
import attendanceReducer from "./slices/attendanceSlice"
import renewalReducer from "./slices/renewalSlice"

export const store = configureStore({
  reducer: {
    auth: authReducer,
    customer: customerReducer,
    services: serviceReducer,
    employee: employeeReducer,
    invoice: invoiceReducer,
    quotation: quotationReducer,
    attendance: attendanceReducer,
    renewal: renewalReducer,
  },
});
