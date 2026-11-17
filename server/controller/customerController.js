import Customer from "../model/customerModel.js";
import {
  getPrefixFromName,
  allocateSmallestJobNo,
  manualAllocateJobNo,
  releaseJobNo,
  restoreJobNo,
} from "../utils/jobNumberService.js";

// Create Customer
export const createCustomer = async (req, res) => {
  try {
    const customerData = { ...req.body };

    if (!customerData.fullName || !customerData.fullName.trim()) {
      return res.status(400).json({ message: "Full Name is required" });
    }

    // Allocate Job Number
    let assignedJobNo = "";

    if (customerData.jobNo && customerData.jobNo.trim()) {
      // Manual selection
      assignedJobNo = customerData.jobNo.trim().toUpperCase();
    } else {
      // Automatic smallest available allocation
      const prefix = getPrefixFromName(customerData.fullName);
      if (!prefix) {
        return res.status(400).json({
          message: "Could not determine an alphabetic prefix from customer name. Please specify Job Number manually.",
        });
      }
      assignedJobNo = await allocateSmallestJobNo(
        prefix,
        null,
        customerData.fullName
      );
    }

    customerData.jobNo = assignedJobNo;
    const newCustomer = new Customer(customerData);
    await newCustomer.save();

    // Link customerId on JobNumber record
    if (customerData.jobNo) {
      await manualAllocateJobNo(
        customerData.jobNo,
        newCustomer._id,
        newCustomer.fullName
      );
    }

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
    const { search, includeArchived, status } = req.query;
    let query = {};

    if (status === "archived" || includeArchived === "only") {
      query.isArchived = true;
    } else if (includeArchived !== "true") {
      query.isArchived = { $ne: true };
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$and = [
        query.isArchived !== undefined ? { isArchived: query.isArchived } : {},
        {
          $or: [
            { fullName: searchRegex },
            { jobNo: searchRegex },
            { archivedJobNo: searchRegex },
            { phone: searchRegex },
            { alternatePhone: searchRegex },
            { companyName: searchRegex },
          ],
        },
      ];
      delete query.isArchived;
    }

    const customers = await Customer.find(query).sort({ jobNo: 1, createdAt: -1 });

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
    const customerId = req.params.id;
    const existingCustomer = await Customer.findById(customerId);

    if (!existingCustomer) {
      return res.status(404).json({ message: "Customer Not Found" });
    }

    const updateData = { ...req.body };

    // Handle Job Number change if explicitly supplied and different
    if (
      updateData.jobNo &&
      updateData.jobNo.trim() &&
      updateData.jobNo.trim().toUpperCase() !== (existingCustomer.jobNo || "").toUpperCase()
    ) {
      const newJobNo = updateData.jobNo.trim().toUpperCase();

      // Allocate new job number
      await manualAllocateJobNo(
        newJobNo,
        customerId,
        updateData.fullName || existingCustomer.fullName
      );

      // Release old job number if existed
      if (existingCustomer.jobNo) {
        await releaseJobNo(
          existingCustomer.jobNo,
          customerId,
          `Customer updated Job Number to ${newJobNo}`
        );
      }

      updateData.jobNo = newJobNo;
    } else if (updateData.jobNo === undefined) {
      // Do not change existing Job Number if not provided
      updateData.jobNo = existingCustomer.jobNo;
    }

    const updatedCustomer = await Customer.findByIdAndUpdate(
      customerId,
      updateData,
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

// Delete / Archive Customer (Soft deletion releasing Job Number for reuse)
export const deleteCustomer = async (req, res) => {
  try {
    const customerId = req.params.id;
    const customer = await Customer.findById(customerId);

    if (!customer) {
      return res.status(404).json({ message: "Customer Not Found" });
    }

    const releasedJobNo = customer.jobNo;

    // Release the Job Number if present
    if (releasedJobNo) {
      await releaseJobNo(
        releasedJobNo,
        customerId,
        "Customer archived via delete action"
      );
    }

    // Soft-archive customer record
    customer.isArchived = true;
    customer.archivedAt = new Date();
    customer.archivedJobNo = releasedJobNo || customer.archivedJobNo || "";
    customer.status = "inactive";
    customer.jobNo = undefined; // release active association

    await customer.save();

    res.status(200).json({
      message: `Customer archived successfully. Job Number ${releasedJobNo || "N/A"} released for reuse.`,
      releasedJobNo,
      customer,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Restore Customer
export const restoreCustomer = async (req, res) => {
  try {
    const customerId = req.params.id;
    const customer = await Customer.findById(customerId);

    if (!customer) {
      return res.status(404).json({ message: "Customer Not Found" });
    }

    if (!customer.isArchived) {
      return res.status(400).json({ message: "Customer is already active." });
    }

    const restoreResult = await restoreJobNo(
      customer.archivedJobNo,
      customerId,
      customer.fullName,
      getPrefixFromName(customer.fullName)
    );

    customer.isArchived = false;
    customer.archivedAt = undefined;
    customer.status = "active";
    customer.jobNo = restoreResult.jobNo;

    await customer.save();

    res.status(200).json({
      message: restoreResult.message,
      restoredOriginal: restoreResult.restoredOriginal,
      customer,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};
