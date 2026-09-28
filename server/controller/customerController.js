import Customer from "../model/customerModel.js";

// Helper: Auto-generate Job No if not provided
const generateNextJobNo = async (fullName) => {
  const initial = (fullName && fullName.trim().charAt(0).toUpperCase()) || "C";
  const prefix = /^[A-Z]$/.test(initial) ? initial : "C";
  const regex = new RegExp(`^${prefix}\\/(\\d+)$`, "i");
  const matchingCustomers = await Customer.find({ jobNo: regex }).select("jobNo").lean();
  let maxNum = 0;
  for (const c of matchingCustomers) {
    const match = c.jobNo ? c.jobNo.match(regex) : null;
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  const nextNum = String(maxNum + 1).padStart(2, "0");
  return `${prefix}/${nextNum}`;
};

// Create Customer
export const createCustomer = async (req, res) => {
  try {
    const customerData = { ...req.body };

    if (!customerData.jobNo || !customerData.jobNo.trim()) {
      customerData.jobNo = await generateNextJobNo(customerData.fullName);
    }

    const newCustomer = new Customer(customerData);

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
    const { search } = req.query;
    let query = {};

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query = {
        $or: [
          { fullName: searchRegex },
          { jobNo: searchRegex },
          { phone: searchRegex },
          { alternatePhone: searchRegex },
          { companyName: searchRegex },
        ],
      };
    }

    const customers = await Customer.find(query);

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
