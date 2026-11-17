import JobNumber from "../model/jobNumberModel.js";
import JobNumberSequence from "../model/jobNumberSequenceModel.js";
import Customer from "../model/customerModel.js";
import {
  getNextAvailablePreview,
  parseJobNo,
  getPrefixFromName,
  syncJobNumberRegistryAndSequences,
} from "../utils/jobNumberService.js";

const ALPHABETS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/**
 * Get Job Number statistics: Total, Assigned, Available, Legacy, and Alphabet breakdown.
 */
export const getJobNumberStats = async (req, res) => {
  try {
    const totalCount = await JobNumber.countDocuments();
    const assignedCount = await JobNumber.countDocuments({ status: "assigned" });
    const availableCount = await JobNumber.countDocuments({ status: "available" });
    const legacyCount = await JobNumber.countDocuments({ isLegacy: true });

    // Breakdown per prefix (A to Z)
    const alphabetStats = await JobNumber.aggregate([
      {
        $group: {
          _id: "$prefix",
          total: { $sum: 1 },
          assigned: {
            $sum: { $cond: [{ $eq: ["$status", "assigned"] }, 1, 0] },
          },
          available: {
            $sum: { $cond: [{ $eq: ["$status", "available"] }, 1, 0] },
          },
          legacy: {
            $sum: { $cond: [{ $eq: ["$isLegacy", true] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const statsMap = new Map();
    for (const item of alphabetStats) {
      if (item._id) statsMap.set(String(item._id).toUpperCase(), item);
    }

    const fullBreakdown = ALPHABETS.map((letter) => {
      const found = statsMap.get(letter);
      return {
        prefix: letter,
        total: found ? found.total : 0,
        assigned: found ? found.assigned : 0,
        available: found ? found.available : 0,
        legacy: found ? found.legacy : 0,
      };
    });

    res.status(200).json({
      success: true,
      totalCount,
      assignedCount,
      availableCount,
      legacyCount,
      prefixBreakdown: fullBreakdown,
      metrics: {
        total: totalCount,
        assigned: assignedCount,
        available: availableCount,
        legacy: legacyCount,
      },
      alphabetBreakdown: fullBreakdown,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get all Job Numbers with filtering by prefix, status, search, and pagination.
 */
export const getAllJobNumbers = async (req, res) => {
  try {
    const { prefix, status, search, page = 1, limit = 50 } = req.query;

    const query = {};

    if (prefix && prefix.trim() && prefix !== "ALL") {
      query.prefix = prefix.trim().toUpperCase();
    }

    if (status && status.trim() && status !== "ALL") {
      query.status = status.trim().toLowerCase();
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");

      // Find any customers matching name, companyName, or phone
      const matchingCustomers = await Customer.find({
        $or: [
          { fullName: searchRegex },
          { companyName: searchRegex },
          { phone: searchRegex },
        ],
      })
        .select("_id")
        .lean();

      const customerIds = matchingCustomers.map((c) => c._id);

      query.$or = [
        { jobNo: searchRegex },
        { customerId: { $in: customerIds } },
        { "assignmentHistory.customerName": searchRegex },
      ];
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const total = await JobNumber.countDocuments(query);

    const jobNumbers = await JobNumber.find(query)
      .populate("customerId", "fullName companyName phone status isArchived")
      .sort({ prefix: 1, sequence: 1, jobNo: 1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .lean();

    res.status(200).json({
      success: true,
      jobNumbers,
      data: jobNumbers,
      pagination: {
        total,
        page: parseInt(page, 10),
        pages: Math.ceil(total / parseInt(limit, 10)),
        limit: parseInt(limit, 10),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Administrative action: Synchronize registry and sequences.
 */
export const syncJobNumberRegistryEndpoint = async (req, res) => {
  try {
    const result = await syncJobNumberRegistryAndSequences();
    res.status(200).json({
      success: true,
      message: `Registry synchronized successfully. Total slots: ${result.totalManaged} (${result.assigned} assigned, ${result.available} available, ${result.legacy} legacy).`,
      result,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get next available Job Number preview for a prefix.
 */
export const getNextAvailable = async (req, res) => {
  try {
    const { prefix, name } = req.query;
    const resolvedPrefix = prefix || getPrefixFromName(name) || "C";
    const preview = await getNextAvailablePreview(resolvedPrefix);

    res.status(200).json({
      success: true,
      prefix: resolvedPrefix,
      ...preview,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Validate availability of a manual Job Number.
 */
export const validateManualJobNo = async (req, res) => {
  try {
    const { jobNo, currentCustomerId } = req.body;
    if (!jobNo || !jobNo.trim()) {
      return res.status(400).json({ success: false, message: "Job Number is required" });
    }

    const clean = jobNo.trim().toUpperCase();
    const existingJobRecord = await JobNumber.findOne({ jobNo: clean }).populate(
      "customerId",
      "fullName"
    );

    if (existingJobRecord) {
      if (
        existingJobRecord.status === "assigned" &&
        existingJobRecord.customerId &&
        String(existingJobRecord.customerId._id) !== String(currentCustomerId)
      ) {
        return res.status(200).json({
          available: false,
          status: "assigned",
          assignedTo: existingJobRecord.customerId.fullName,
          message: `Job Number ${clean} is already assigned to ${existingJobRecord.customerId.fullName}.`,
        });
      }

      return res.status(200).json({
        available: true,
        status: existingJobRecord.status,
        message: `Job Number ${clean} is available.`,
      });
    }

    // Check active Customer
    const activeCust = await Customer.findOne({
      jobNo: clean,
      _id: { $ne: currentCustomerId },
      isArchived: { $ne: true },
    }).select("fullName");

    if (activeCust) {
      return res.status(200).json({
        available: false,
        status: "assigned",
        assignedTo: activeCust.fullName,
        message: `Job Number ${clean} is currently held by active customer ${activeCust.fullName}.`,
      });
    }

    res.status(200).json({
      available: true,
      status: "unregistered_new",
      message: `Job Number ${clean} is valid and available for allocation.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
