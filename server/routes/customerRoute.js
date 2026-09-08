import express from "express";
import {
  createCustomer,
  getAllCustomers,
  getCustomer,
  updateCustomer,
  deleteCustomer,
} from "../controller/customerController.js";

const router = express.Router();

router.get("/", getAllCustomers);
router.get("/:id", getCustomer);
router.post("/create", createCustomer);
router.put("/:id", updateCustomer);
router.delete("/:id", deleteCustomer);


export default router;