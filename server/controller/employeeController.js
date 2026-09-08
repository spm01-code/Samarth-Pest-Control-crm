import Employee from "../model/employeeModel.js";

// Create Employee
export const createEmployee = async (req, res) => {
  try {
    const newEmployee = new Employee(req.body);

    await newEmployee.save();

    res.status(201).json({
      message: "Employee Created",
      employee: newEmployee,
    });

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};


// Get All Employees
export const getAllEmployees = async (req, res) => {
  try {
    const employees = await Employee.find();

    res.status(200).json(employees);

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};


// Get Single Employee
export const getEmployee = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({
        message: "Employee Not Found",
      });
    }

    res.status(200).json(employee);

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};


// Update Employee
export const updateEmployee = async (req, res) => {
  try {
    const updatedEmployee = await Employee.findByIdAndUpdate(
      req.params.id,
      req.body,
      { returnDocument: "after" }
    );

    res.status(200).json({
      message: "Employee Updated",
      employee: updatedEmployee,
    });

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};


// Delete Employee
export const deleteEmployee = async (req, res) => {
  try {
    await Employee.findByIdAndDelete(req.params.id);

    res.status(200).json({
      message: "Employee Deleted",
    });

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};
