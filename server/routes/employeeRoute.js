import express from "express";
import {
  createEmployee,
  getAllEmployees,
  getEmployee,
  updateEmployee,
  deleteEmployee,
} from "../controller/employeeController.js";

const router = express.Router();

router.get("/", getAllEmployees);
router.get("/:id", getEmployee);
router.post("/create", createEmployee);
router.put("/:id", updateEmployee);
router.delete("/:id", deleteEmployee);


export default router;