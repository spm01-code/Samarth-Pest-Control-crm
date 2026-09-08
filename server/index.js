import dotenv from "dotenv";
dotenv.config();
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import cookieParser from "cookie-parser";
import customerRoutes from "./routes/customerRoute.js";
import employeeRoutes from "./routes/employeeRoute.js";
import serviceRoutes from "./routes/serviceRoute.js";
import adminRoutes from "./routes/adminRoute.js";
import invoiceRoutes from "./routes/invoiceRoute.js";
import quotationRoutes from "./routes/quotationRoute.js";
import attendanceRoutes from "./routes/attendanceRoute.js";
import renewalRoutes from "./routes/renewalRoute.js";
import authMiddleware from "./middleware/authMiddleware.js";
import templateRoutes from "./routes/templateRoute.js";
import companySettingRoutes from "./routes/companySettingRoute.js";
import importRoutes from "./routes/importRoute.js";

const app = express();
const PORT = process.env.PORT || 8000;

// Middlewares
// CORS
const allowedOrigins = [
  "https://samarth-pest-control-crm.vercel.app",
  "http://localhost:5173",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());
app.use(express.urlencoded({ limit: "50mb", extended: true }));
// Database Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("MongoDB Connected");
    try {
      const Customer = await import("./model/customerModel.js").then((m) => m.default);
      try { await Customer.collection.dropIndex("phone_1"); } catch (e) {}
      try { await Customer.collection.createIndex({ phone: 1 }, { unique: true, sparse: true }); } catch (e) {}
      
      const { syncExistingDocumentSequences } = await import(
        "./utils/documentNumberService.js"
      );
      const [Invoice, Quotation, Renewal, Service] = await Promise.all([
        import("./model/invoiceModel.js").then((m) => m.default),
        import("./model/quotationModel.js").then((m) => m.default),
        import("./model/renewalModel.js").then((m) => m.default),
        import("./model/serviceModel.js").then((m) => m.default),
      ]);
      await syncExistingDocumentSequences({
        Invoice,
        Quotation,
        Renewal,
        Service,
      });
    } catch (syncErr) {
      console.error("Initial sequence sync warning:", syncErr.message);
    }
  })
  .catch((err) => {
    console.log("DB Connection Error:", err);
  });

// Routes
app.get("/", (req, res) => {
  res.send("Hello");
});
app.use("/api/admin", adminRoutes);
app.use("/api/customers", authMiddleware, customerRoutes);
app.use("/api/employees", authMiddleware, employeeRoutes);
app.use("/api/services", authMiddleware, serviceRoutes);
app.use("/api/invoices", authMiddleware, invoiceRoutes);
app.use("/api/quotations", authMiddleware, quotationRoutes);
app.use("/api/attendance", authMiddleware, attendanceRoutes);
app.use("/api/renewals", authMiddleware, renewalRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/company-settings", companySettingRoutes);
app.use("/api/import", importRoutes);

// Server
app.listen(PORT, (req, res) => {
  console.log(`App is running on port ${PORT}`);
});
