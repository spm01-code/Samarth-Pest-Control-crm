import Customer from "../model/customerModel.js";

// Create Customer
export const createCustomer = async (req, res) => {
  try {
    const newCustomer = new Customer(req.body);

    await newCustomer.save();

    res.status(201).json({
      message: "Customer Created",
      customer: newCustomer,
    });

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};


// Get All Customers
export const getAllCustomers = async (req, res) => {
  try {
    const customers = await Customer.find();

    res.status(200).json(customers);

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};


// Get Single Customer
export const getCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({
        message: "Customer Not Found",
      });
    }

    res.status(200).json(customer);

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};


// Update Customer
export const updateCustomer = async (req, res) => {
  try {
    const updatedCustomer = await Customer.findByIdAndUpdate(
      req.params.id,
      req.body,
      { returnDocument: "after" }
    );

    res.status(200).json({
      message: "Customer Updated",
      customer: updatedCustomer,
    });

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};


// Delete Customer
export const deleteCustomer = async (req, res) => {
  try {
    await Customer.findByIdAndDelete(req.params.id);

    res.status(200).json({
      message: "Customer Deleted",
    });

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};
