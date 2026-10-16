import mongoose from "mongoose";
import Service from "../model/serviceModel.js";
import Customer from "../model/customerModel.js";
import {
  calculateServiceDates,
  normalizeFrequency,
  isMultiDateFrequency,
  isOneTimeJobService,
} from "../utils/serviceDateCalculator.js";
import { generateDocumentNumber } from "../utils/documentNumberService.js";
import { generateOneTimeJobDocx } from "../utils/docGenerator.js";
import { convertDocxToPdf } from "../utils/docxToPdf.js";

const getIndiaDateBoundaries = () => {
  const dateParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const getPart = (type) =>
    dateParts.find((part) => part.type === type)?.value;

  const today = new Date(
    `${getPart("year")}-${getPart("month")}-${getPart("day")}T00:00:00.000Z`,
  );
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  return { today, tomorrow };
};

const ensureUpcomingDates = (service) => {
  if (!service) return service;
  const doc = service.toObject ? service.toObject() : { ...service };
  if (
    isMultiDateFrequency(doc.frequency) &&
    (!doc.upcomingServiceDates || doc.upcomingServiceDates.length === 0) &&
    doc.serviceDate
  ) {
    const { upcomingServiceDates, nextServiceDate } = calculateServiceDates(
      doc.serviceDate,
      doc.frequency
    );
    doc.upcomingServiceDates = upcomingServiceDates;
    if (!doc.nextServiceDate) {
      doc.nextServiceDate = nextServiceDate;
    }
  }

  // Ensure consistent customerName on output
  if (!doc.customerName && doc.customer && typeof doc.customer === "object") {
    doc.customerName = doc.customer.fullName || doc.customer.companyName || "";
  }

  return doc;
};

const syncServiceStatuses = async (serviceId) => {
  const { today, tomorrow } = getIndiaDateBoundaries();
  const baseFilter = {
    ...(serviceId ? { _id: serviceId } : {}),
    status: { $nin: ["completed", "cancelled"] },
    nextServiceDate: { $ne: null },
  };

  await Service.updateMany(
    {
      ...baseFilter,
      nextServiceDate: { $lt: today },
    },
    { $set: { status: "expired" } },
  );

  await Service.updateMany(
    {
      ...baseFilter,
      nextServiceDate: {
        $gte: today,
        $lt: tomorrow,
      },
    },
    { $set: { status: "due" } },
  );
};

// Create Service
export const createService = async (req, res) => {
  try {
    const payload = { ...req.body };

    if (payload.frequency) {
      payload.frequency = normalizeFrequency(payload.frequency);
    }

    const isOneTime = payload.frequency === "one-time";

    // Conditional Customer Validation
    if (isOneTime) {
      if (!payload.customerName || !String(payload.customerName).trim()) {
        return res.status(400).json({
          message: "Customer name is required for One Time services",
        });
      }
      payload.customerName = String(payload.customerName).trim();

      // For standalone one-time services, sanitize customer reference:
      // If customer is empty string or not a valid ObjectId, delete it so no invalid reference is stored.
      if (!payload.customer || payload.customer === "") {
        delete payload.customer;
      } else if (!mongoose.Types.ObjectId.isValid(payload.customer)) {
        delete payload.customer;
      }
    } else {
      // Non-one-time services strictly require an existing customer
      if (!payload.customer || payload.customer === "") {
        return res.status(400).json({
          message: "Customer is required for recurring services",
        });
      }

      if (!mongoose.Types.ObjectId.isValid(payload.customer)) {
        return res.status(400).json({
          message: "Invalid Customer ID",
        });
      }

      const existingCustomer = await Customer.findById(payload.customer);
      if (!existingCustomer) {
        return res.status(404).json({
          message: "Customer not found",
        });
      }
    }

    // Sanitize employee field
    if (!payload.employee || payload.employee === "") {
      delete payload.employee;
    }

    // Auto-allocate atomic ONE_TIME_JOB number for One Time Job records
    if (isOneTime) {
      const { documentNumber: jobNo } = await generateDocumentNumber(
        "ONE_TIME_JOB"
      );
      payload.jobNo = jobNo;
    }

    if (payload.serviceDate && payload.frequency) {
      const { nextServiceDate, upcomingServiceDates } = calculateServiceDates(
        payload.serviceDate,
        payload.frequency
      );
      payload.nextServiceDate = nextServiceDate;
      payload.upcomingServiceDates = upcomingServiceDates;
    }

    const newService = new Service(payload);
    await newService.save();

    await newService.populate([
      { path: "customer", select: "fullName phone" },
      { path: "employee", select: "fullName role" },
    ]);

    res.status(201).json({
      message: "Service Created",
      service: ensureUpcomingDates(newService),
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Get All Services
export const getAllServices = async (req, res) => {
  try {
    await syncServiceStatuses();

    const services = await Service.find()
      .populate("customer", "fullName phone")
      .populate("employee", "fullName role");

    const mappedServices = services.map((s) => ensureUpcomingDates(s));

    res.status(200).json(mappedServices);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Get Single Service
export const getService = async (req, res) => {
  try {
    const id = req.params.id;

    await syncServiceStatuses(id);

    const oneService = await Service.findById(id)
      .populate("customer")
      .populate("employee", "fullName role phone")
      .populate("serviceOccurrences.employee", "fullName role phone");

    if (!oneService) {
      return res.status(404).json({
        message: "Service Not Found",
      });
    }

    res.status(200).json(ensureUpcomingDates(oneService));
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Update Service
export const updateService = async (req, res) => {
  try {
    const payload = { ...req.body };

    if (payload.frequency) {
      payload.frequency = normalizeFrequency(payload.frequency);
    }

    const existingService = await Service.findById(req.params.id);
    if (!existingService) {
      return res.status(404).json({
        message: "Service Not Found",
      });
    }

    const effectiveFreq = payload.frequency || existingService.frequency;
    const isOneTime = effectiveFreq === "one-time";

    // Conditional Customer Validation for Update
    if (isOneTime) {
      if (payload.customerName !== undefined) {
        if (!payload.customerName || !String(payload.customerName).trim()) {
          return res.status(400).json({
            message: "Customer name is required for One Time services",
          });
        }
        payload.customerName = String(payload.customerName).trim();
      } else if (!existingService.customerName && !existingService.customer) {
        return res.status(400).json({
          message: "Customer name is required for One Time services",
        });
      }

      // Handle customer field:
      // If customer is explicitly passed as null/empty or invalid ObjectId, set to null
      if (payload.customer === "" || payload.customer === null) {
        payload.customer = null;
      } else if (payload.customer && !mongoose.Types.ObjectId.isValid(payload.customer)) {
        payload.customer = null;
      }
    } else {
      // Frequency is recurring (not one-time). Customer selection is mandatory!
      const targetCustomer =
        payload.customer !== undefined ? payload.customer : existingService.customer;

      if (!targetCustomer || targetCustomer === "") {
        return res.status(400).json({
          message: "Customer is required for recurring services",
        });
      }

      const idToCheck =
        typeof targetCustomer === "object" ? targetCustomer._id : targetCustomer;

      if (!mongoose.Types.ObjectId.isValid(idToCheck)) {
        return res.status(400).json({
          message: "Invalid Customer ID",
        });
      }

      const existingCustomer = await Customer.findById(idToCheck);
      if (!existingCustomer) {
        return res.status(404).json({
          message: "Customer not found",
        });
      }

      payload.customer = idToCheck;
    }

    // Sanitize employee field to prevent CastError when cleared or empty
    if (!payload.employee || payload.employee === "") {
      payload.employee = null;
    }

    // Sanitize jobNo field
    if (isOneTime) {
      if (typeof payload.jobNo === "string" && payload.jobNo.trim()) {
        payload.jobNo = payload.jobNo.trim();
      } else if (!existingService.jobNo) {
        // Auto-allocate atomic job number if service had none and is now one-time
        const { documentNumber: jobNo } = await generateDocumentNumber(
          "ONE_TIME_JOB"
        );
        payload.jobNo = jobNo;
      } else {
        // Retain existing jobNo if payload didn't specify one
        payload.jobNo = existingService.jobNo;
      }
    } else if (payload.jobNo === "") {
      // Omit empty jobNo on non-one-time services to prevent sparse index collision
      delete payload.jobNo;
    }

    // Sanitize serviceOccurrences if provided
    if (Array.isArray(payload.serviceOccurrences)) {
      payload.serviceOccurrences = payload.serviceOccurrences.map((occ) => {
        const cleanOcc = { ...occ };
        if (!cleanOcc.employee || cleanOcc.employee === "") {
          delete cleanOcc.employee;
        }
        if (!cleanOcc.serviceDate || cleanOcc.serviceDate === "") {
          delete cleanOcc.serviceDate;
        }
        return cleanOcc;
      });
    }

    const effectiveDate = payload.serviceDate || existingService.serviceDate;

    if (payload.serviceDate || payload.frequency) {
      const { nextServiceDate, upcomingServiceDates } = calculateServiceDates(
        effectiveDate,
        effectiveFreq
      );
      payload.nextServiceDate = nextServiceDate;
      payload.upcomingServiceDates = upcomingServiceDates;
    }

    const updatedService = await Service.findByIdAndUpdate(
      req.params.id,
      payload,
      { returnDocument: "after", runValidators: true }
    )
      .populate("customer")
      .populate("employee", "fullName role phone")
      .populate("serviceOccurrences.employee", "fullName role phone");

    res.status(200).json({
      message: "Service Updated",
      service: ensureUpcomingDates(updatedService),
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Delete Service
export const deleteService = async (req, res) => {
  try {
    const deletedService = await Service.findByIdAndDelete(req.params.id);

    if (!deletedService) {
      return res.status(404).json({
        message: "Service Not Found",
      });
    }

    res.status(200).json({
      message: "Service Deleted",
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Generate Service Paper DOCX
export const generateServiceDocx = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id)
      .populate("customer")
      .populate("employee")
      .populate("serviceOccurrences.employee");

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    if (!isOneTimeJobService(service)) {
      return res.status(400).json({
        success: false,
        message: "Service Paper is only available for One Time Job services",
      });
    }

    const result = await generateOneTimeJobDocx(service);

    const jobNo = service.jobNo || `service-${service._id}`;
    const cleanJobNo = String(jobNo).replace(/[\\/:\*\?"<>\|]/g, "-");
    const fileName = `${cleanJobNo}.docx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", result.buffer.length);

    return res.send(result.buffer);
  } catch (error) {
    console.error("Generate service DOCX error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Generate Service Paper PDF
export const generateServicePdf = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id)
      .populate("customer")
      .populate("employee")
      .populate("serviceOccurrences.employee");

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    if (!isOneTimeJobService(service)) {
      return res.status(400).json({
        success: false,
        message: "Service Paper is only available for One Time Job services",
      });
    }

    const docxResult = await generateOneTimeJobDocx(service);
    const pdfBuffer = await convertDocxToPdf(docxResult.buffer);

    const jobNo = service.jobNo || `service-${service._id}`;
    const cleanJobNo = String(jobNo).replace(/[\\/:\*\?"<>\|]/g, "-");
    const fileName = `${cleanJobNo}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.setHeader("Content-Length", pdfBuffer.length);

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Generate service PDF error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
