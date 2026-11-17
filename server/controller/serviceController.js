import mongoose from "mongoose";
import Service from "../model/serviceModel.js";
import Customer from "../model/customerModel.js";
import Employee from "../model/employeeModel.js";
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
  if (!doc.customerName) {
    if (doc.customer && typeof doc.customer === "object") {
      doc.customerName = doc.customer.fullName || doc.customer.companyName || "";
    } else if (doc.customerSnapshot) {
      doc.customerName =
        doc.customerSnapshot.fullName ||
        doc.customerSnapshot.customerName ||
        doc.customerSnapshot.companyName ||
        "";
    }
  }

  // Ensure One Time Job payment and occurrence structure backward compatibility
  const isOneTime = isOneTimeJobService(doc);
  if (isOneTime) {
    if (doc.totalAmount === undefined || doc.totalAmount === null || doc.totalAmount === 0) {
      doc.totalAmount = Number(doc.amount || 0);
    }
    if (doc.paidAmount === undefined || doc.paidAmount === null) {
      doc.paidAmount = 0;
    }
    if (doc.balanceAmount === undefined || doc.balanceAmount === null) {
      doc.balanceAmount = Math.max(0, doc.totalAmount - doc.paidAmount);
    }
    if (!doc.paymentStatus) {
      doc.paymentStatus =
        doc.paidAmount >= doc.totalAmount && doc.totalAmount > 0
          ? "Paid"
          : doc.paidAmount > 0
          ? "Partially Paid"
          : "Unpaid";
    }
    if (!Array.isArray(doc.paymentHistory)) {
      doc.paymentHistory = [];
    }
    if (!Array.isArray(doc.serviceOccurrences) || doc.serviceOccurrences.length === 0) {
      doc.serviceOccurrences = [
        {
          _id: "occ-1",
          serviceNo: "1st Service / One Time",
          occurrenceType: "1st-service",
          serviceDate: doc.serviceDate,
          serviceTime: doc.serviceTime || "",
          operatorName: doc.operatorName || (doc.employee?.fullName) || "",
          employee: doc.employee || null,
          amount: doc.totalAmount || doc.amount || 0,
          paymentStatus: doc.paymentStatus || "Unpaid",
          clientSignature: doc.clientSignature || "",
          remark: doc.remark || "",
        },
      ];
    }
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
    let existingCustomer = null;

    // Resolve customer if ID is provided
    if (payload.customer && mongoose.Types.ObjectId.isValid(payload.customer)) {
      existingCustomer = await Customer.findById(payload.customer);
      if (existingCustomer) {
        payload.customer = existingCustomer._id;
        if (!payload.customerName) {
          payload.customerName =
            existingCustomer.fullName || existingCustomer.companyName || "";
        }
      } else if (!isOneTime) {
        return res.status(404).json({
          message: "Customer not found",
        });
      } else {
        delete payload.customer;
      }
    } else if (payload.customer === "" || !payload.customer) {
      delete payload.customer;
    } else if (!mongoose.Types.ObjectId.isValid(payload.customer)) {
      delete payload.customer;
    }

    // Conditional Customer Validation
    if (isOneTime) {
      if (!payload.customerName || !String(payload.customerName).trim()) {
        return res.status(400).json({
          message: "Customer name is required for One Time services",
        });
      }
      payload.customerName = String(payload.customerName).trim();
    } else {
      // Non-one-time services strictly require an existing customer
      if (!payload.customer || !existingCustomer) {
        return res.status(400).json({
          message: "Customer is required for recurring services",
        });
      }
    }

    // Sanitize employee and operatorName fields
    if (payload.operatorName) {
      payload.operatorName = String(payload.operatorName).trim();
    }
    if (payload.employee && mongoose.Types.ObjectId.isValid(payload.employee)) {
      const emp = await Employee.findById(payload.employee);
      if (emp && !payload.operatorName) {
        payload.operatorName = emp.fullName;
      } else if (!emp) {
        delete payload.employee;
      }
    } else if (payload.employee && !mongoose.Types.ObjectId.isValid(payload.employee)) {
      if (!payload.operatorName) {
        payload.operatorName = String(payload.employee).trim();
      }
      delete payload.employee;
    } else if (!payload.employee || payload.employee === "") {
      delete payload.employee;
    }

    // Auto-allocate atomic ONE_TIME_JOB number for One Time Job records
    if (isOneTime) {
      const { documentNumber: jobNo } = await generateDocumentNumber(
        "ONE_TIME_JOB"
      );
      payload.documentNumber = jobNo;
      payload.jobNo = jobNo;

      // Requirement 2: Remove Description, Remark and Payment Details from One Time Job creation
      delete payload.desc;
      delete payload.remark;
      delete payload.paymentDetails;

      // Requirement 4: One Time Job payment tracking initialization
      const amountVal = Number(payload.amount || 0);
      payload.totalAmount = Number(payload.totalAmount ?? amountVal);
      const initialPaid = Number(payload.paidAmount || 0);
      payload.paidAmount = initialPaid;
      payload.balanceAmount = Math.max(0, payload.totalAmount - initialPaid);
      payload.paymentStatus =
        payload.balanceAmount === 0 && payload.totalAmount > 0
          ? "Paid"
          : initialPaid > 0
          ? "Partially Paid"
          : "Unpaid";

      if (initialPaid > 0 && (!payload.paymentHistory || payload.paymentHistory.length === 0)) {
        payload.paymentHistory = [
          {
            receivedAmount: initialPaid,
            date: new Date(),
            mode: payload.paymentMethod || "Cash",
            balance: payload.balanceAmount,
            remark: "Initial Payment",
          },
        ];
      }

      // Requirement 4A: Initialize 1st service entry (only ONE service entry required during initial creation)
      if (!Array.isArray(payload.serviceOccurrences) || payload.serviceOccurrences.length === 0) {
        payload.serviceOccurrences = [
          {
            serviceNo: "1st Service / One Time",
            occurrenceType: "1st-service",
            serviceDate: payload.serviceDate || new Date(),
            serviceTime: payload.serviceTime || "",
            operatorName: payload.operatorName || "",
            employee: payload.employee || null,
            amount: amountVal,
            paymentStatus: payload.paymentStatus,
            clientSignature: payload.clientSignature || "",
            remark: "",
          },
        ];
      }
    } else if (existingCustomer && existingCustomer.jobNo && !payload.jobNo) {
      payload.jobNo = existingCustomer.jobNo;
    }

    if (existingCustomer) {
      payload.customerSnapshot = {
        jobNo: existingCustomer.jobNo || existingCustomer.archivedJobNo || "",
        customerName: existingCustomer.fullName || existingCustomer.companyName || "",
        fullName: existingCustomer.fullName || "",
        companyName: existingCustomer.companyName || "",
        address: existingCustomer.address || payload.address || "",
        phone: existingCustomer.phone || payload.contactNumber || "",
        email: existingCustomer.email || "",
        gstNumber: existingCustomer.gstNumber || "",
        contactPerson: existingCustomer.contactPerson || payload.contactPerson || "",
        snapshotTakenAt: new Date(),
      };
    } else if (isOneTime) {
      payload.customerSnapshot = {
        jobNo: payload.jobNo || "",
        customerName: payload.customerName,
        fullName: payload.customerName,
        companyName: payload.customerSnapshot?.companyName || "",
        address: payload.address || payload.customerSnapshot?.address || "",
        phone: payload.contactNumber || payload.customerSnapshot?.phone || "",
        email: payload.customerSnapshot?.email || "",
        gstNumber: payload.customerSnapshot?.gstNumber || "",
        contactPerson: payload.contactPerson || payload.customerSnapshot?.contactPerson || "",
        snapshotTakenAt: new Date(),
      };
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

      // Handle customer field
      if (payload.customer && mongoose.Types.ObjectId.isValid(payload.customer)) {
        const existingCustomer = await Customer.findById(payload.customer);
        if (existingCustomer) {
          payload.customer = existingCustomer._id;
          if (!payload.customerName) {
            payload.customerName =
              existingCustomer.fullName || existingCustomer.companyName || "";
          }
          payload.customerSnapshot = {
            jobNo: existingCustomer.jobNo || existingCustomer.archivedJobNo || "",
            customerName: existingCustomer.fullName || existingCustomer.companyName || "",
            fullName: existingCustomer.fullName || "",
            companyName: existingCustomer.companyName || "",
            address: existingCustomer.address || payload.address || existingService.address || "",
            phone: existingCustomer.phone || payload.contactNumber || existingService.contactNumber || "",
            email: existingCustomer.email || "",
            gstNumber: existingCustomer.gstNumber || "",
            contactPerson: existingCustomer.contactPerson || payload.contactPerson || existingService.contactPerson || "",
            snapshotTakenAt: new Date(),
          };
        } else {
          payload.customer = null;
        }
      } else if (payload.customer === "" || payload.customer === null) {
        payload.customer = null;
        const effectiveCustName =
          payload.customerName ||
          existingService.customerName ||
          existingService.customerSnapshot?.fullName ||
          "";
        payload.customerSnapshot = {
          ...(existingService.customerSnapshot || {}),
          jobNo: existingService.jobNo || "",
          customerName: effectiveCustName,
          fullName: effectiveCustName,
          address: payload.address !== undefined ? payload.address : (existingService.address || ""),
          phone: payload.contactNumber !== undefined ? payload.contactNumber : (existingService.contactNumber || ""),
          contactPerson: payload.contactPerson !== undefined ? payload.contactPerson : (existingService.contactPerson || ""),
          snapshotTakenAt: new Date(),
        };
      } else if (payload.customer && !mongoose.Types.ObjectId.isValid(payload.customer)) {
        payload.customer = null;
      } else if (payload.customerName !== undefined || payload.address !== undefined || payload.contactNumber !== undefined) {
        if (!existingService.customer) {
          const effectiveCustName =
            payload.customerName ||
            existingService.customerName ||
            existingService.customerSnapshot?.fullName ||
            "";
          payload.customerSnapshot = {
            ...(existingService.customerSnapshot || {}),
            jobNo: existingService.jobNo || "",
            customerName: effectiveCustName,
            fullName: effectiveCustName,
            address: payload.address !== undefined ? payload.address : (existingService.address || ""),
            phone: payload.contactNumber !== undefined ? payload.contactNumber : (existingService.contactNumber || ""),
            contactPerson: payload.contactPerson !== undefined ? payload.contactPerson : (existingService.contactPerson || ""),
            snapshotTakenAt: new Date(),
          };
        }
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
      payload.customerSnapshot = {
        jobNo: existingCustomer.jobNo || existingCustomer.archivedJobNo || "",
        customerName: existingCustomer.fullName || existingCustomer.companyName || "",
        fullName: existingCustomer.fullName || "",
        companyName: existingCustomer.companyName || "",
        address: existingCustomer.address || payload.address || existingService.address || "",
        phone: existingCustomer.phone || payload.contactNumber || existingService.contactNumber || "",
        email: existingCustomer.email || "",
        gstNumber: existingCustomer.gstNumber || "",
        contactPerson: existingCustomer.contactPerson || payload.contactPerson || existingService.contactPerson || "",
        snapshotTakenAt: new Date(),
      };
    }

    // Sanitize employee and operatorName field
    if (payload.operatorName !== undefined) {
      payload.operatorName = String(payload.operatorName).trim();
    }
    if (payload.employee && !mongoose.Types.ObjectId.isValid(payload.employee)) {
      if (!payload.operatorName) {
        payload.operatorName = String(payload.employee).trim();
      }
      payload.employee = null;
    } else if (!payload.employee || payload.employee === "") {
      payload.employee = null;
    }

    // Sanitize jobNo field
    if (isOneTime) {
      if (typeof payload.jobNo === "string" && payload.jobNo.trim()) {
        payload.jobNo = payload.jobNo.trim();
        if (!payload.documentNumber) payload.documentNumber = payload.jobNo;
      } else if (!existingService.jobNo && !existingService.documentNumber) {
        // Auto-allocate atomic job number if service had none and is now one-time
        const { documentNumber: jobNo } = await generateDocumentNumber(
          "ONE_TIME_JOB"
        );
        payload.documentNumber = jobNo;
        payload.jobNo = jobNo;
      } else {
        // Retain existing jobNo if payload didn't specify one
        payload.jobNo = existingService.jobNo;
        payload.documentNumber = existingService.documentNumber || existingService.jobNo;
      }

      // One Time Job payment calculations
      const totalVal = Number(
        payload.totalAmount ??
        payload.amount ??
        existingService.totalAmount ??
        existingService.amount ??
        0
      );
      payload.totalAmount = totalVal;
      payload.amount = totalVal;

      let paidVal = Number(
        payload.paidAmount ?? existingService.paidAmount ?? 0
      );
      if (Array.isArray(payload.paymentHistory)) {
        paidVal = payload.paymentHistory.reduce(
          (sum, p) => sum + Number(p.receivedAmount || 0),
          0
        );
      }
      payload.paidAmount = paidVal;
      payload.balanceAmount = Math.max(0, totalVal - paidVal);
      payload.paymentStatus =
        payload.balanceAmount === 0 && totalVal > 0
          ? "Paid"
          : paidVal > 0
          ? "Partially Paid"
          : "Unpaid";
    } else if (payload.jobNo === "") {
      // Omit empty jobNo on non-one-time services to prevent sparse index collision
      delete payload.jobNo;
    }

    // Sanitize serviceOccurrences if provided
    if (Array.isArray(payload.serviceOccurrences)) {
      payload.serviceOccurrences = payload.serviceOccurrences.map((occ, idx) => {
        const cleanOcc = { ...occ };
        if (cleanOcc.operatorName) {
          cleanOcc.operatorName = String(cleanOcc.operatorName).trim();
        }
        if (cleanOcc.employee && !mongoose.Types.ObjectId.isValid(cleanOcc.employee)) {
          if (!cleanOcc.operatorName) {
            cleanOcc.operatorName = String(cleanOcc.employee).trim();
          }
          cleanOcc.employee = null;
        } else if (!cleanOcc.employee || cleanOcc.employee === "") {
          cleanOcc.employee = null;
        }
        if (!cleanOcc.serviceDate || cleanOcc.serviceDate === "") {
          delete cleanOcc.serviceDate;
        }
        if (!cleanOcc.serviceNo) {
          const ordinal =
            idx === 0
              ? "1st Service / One Time"
              : idx === 1
              ? "2nd Service / Complaint"
              : idx === 2
              ? "3rd Service / Complaint"
              : `${idx + 1}th Service / Complaint`;
          cleanOcc.serviceNo = ordinal;
        }
        cleanOcc.amount = Number(cleanOcc.amount || 0);
        cleanOcc.paymentStatus = cleanOcc.paymentStatus || "Unpaid";
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

    if (result.isPdfDirect) {
      const fileName = `${cleanJobNo}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.setHeader("Content-Length", result.buffer.length);
      return res.send(result.buffer);
    }

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
    return res.status(error.statusCode || 500).json({
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
    const pdfBuffer = docxResult.isPdfDirect
      ? docxResult.buffer
      : await convertDocxToPdf(docxResult.buffer);

    const jobNo = service.jobNo || `service-${service._id}`;
    const cleanJobNo = String(jobNo).replace(/[\\/:\*\?"<>\|]/g, "-");
    const fileName = `${cleanJobNo}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.setHeader("Content-Length", pdfBuffer.length);

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Generate service PDF error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message,
    });
  }
};

// Record Payment for One Time Job
export const recordServicePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const rawAmount = req.body.receivedAmount ?? req.body.amount;
    const rawDate = req.body.date ?? req.body.paymentDate;
    const rawMode = req.body.mode ?? req.body.paymentMode;
    const rawRemark = req.body.remark ?? req.body.note;

    const amountNum = Number(rawAmount);
    if (!amountNum || amountNum <= 0 || isNaN(amountNum)) {
      return res.status(400).json({
        success: false,
        message: "Payment amount must be greater than 0",
      });
    }

    const service = await Service.findById(id);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    const effectiveTotal = Number(service.totalAmount ?? service.amount ?? 0);
    const currentPaid = Number(service.paidAmount ?? 0);
    const currentBalance = Math.max(0, effectiveTotal - currentPaid);

    if (amountNum > currentBalance) {
      return res.status(400).json({
        success: false,
        message: `Payment amount (₹${amountNum}) cannot exceed remaining balance (₹${currentBalance})`,
      });
    }

    const newPaid = currentPaid + amountNum;
    const newBalance = Math.max(0, effectiveTotal - newPaid);
    const newStatus = newPaid >= effectiveTotal ? "Paid" : "Partially Paid";

    const paymentDateVal = rawDate ? new Date(rawDate) : new Date();

    const paymentEntry = {
      receivedAmount: amountNum,
      amount: amountNum,
      date: paymentDateVal,
      paymentDate: paymentDateVal,
      mode: rawMode || "Cash",
      paymentMode: rawMode || "Cash",
      balance: newBalance,
      balanceAfter: newBalance,
      remark: rawRemark ? String(rawRemark).trim() : "",
      note: rawRemark ? String(rawRemark).trim() : "",
      recordedAt: new Date(),
    };

    service.paidAmount = newPaid;
    service.balanceAmount = newBalance;
    service.paymentStatus = newStatus;
    if (!Array.isArray(service.paymentHistory)) {
      service.paymentHistory = [];
    }
    service.paymentHistory.push(paymentEntry);

    await service.save();

    const populated = await Service.findById(id)
      .populate("customer")
      .populate("employee", "fullName role phone")
      .populate("serviceOccurrences.employee", "fullName role phone");

    return res.status(200).json({
      success: true,
      message: "Payment recorded successfully",
      service: ensureUpcomingDates(populated),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
