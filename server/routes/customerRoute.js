import express from "express";
import {
  createCustomer,
  getAllCustomers,
  getCustomer,
  updateCustomer,
  deleteCustomer,
  restoreCustomer,
} from "../controller/customerController.js";

const router = express.Router();

router.get("/", getAllCustomers);
router.get("/:id", getCustomer);
router.post("/create", createCustomer);
router.post("/:id/restore", restoreCustomer);
router.put("/:id", updateCustomer);
router.delete("/:id", deleteCustomer);


export default router;