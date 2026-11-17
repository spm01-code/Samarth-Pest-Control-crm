import JobNumber from "../model/jobNumberModel.js";
import JobNumberSequence from "../model/jobNumberSequenceModel.js";
import Customer from "../model/customerModel.js";

/**
 * Extracts first meaningful alphabetic character [A-Z].
 */
export const getPrefixFromName = (fullName) => {
  if (!fullName || typeof fullName !== "string") return null;
  const trimmed = fullName.trim();
  const match = trimmed.match(/[a-zA-Z]/);
  return match ? match[0].toUpperCase() : null;
};

/**
 * Parses a Job Number string into prefix, sequence, and standard/legacy status.
 * Standard format: PREFIX/NN (e.g. A/01, B/12, C/105)
 * Non-standard / Legacy: A/07X4, H/O2, P/05A, S/05-1, etc.
 */
export const parseJobNo = (jobNoStr) => {
  if (!jobNoStr || typeof jobNoStr !== "string") {
    return { isStandard: false, prefix: "C", sequence: null, isLegacy: true };
  }
  const clean = jobNoStr.trim().toUpperCase();
  const standardMatch = clean.match(/^([A-Z])\/(\d+)$/);
  if (standardMatch) {
    return {
      isStandard: true,
      prefix: standardMatch[1],
      sequence: parseInt(standardMatch[2], 10),
      isLegacy: false,
      cleanJobNo: clean,
    };
  }

  // Non-standard / legacy format
  const firstLetterMatch = clean.match(/^[A-Z]/);
  const prefix = firstLetterMatch ? firstLetterMatch[0] : "C";
  return {
    isStandard: false,
    prefix,
    sequence: null,
    isLegacy: true,
    cleanJobNo: clean,
  };
};

/**
 * Initializes and synchronizes JobNumber registry and sequence counters.
 * Scans Customer records, registers missing JobNumbers (standard + legacy),
 * identifies vacant slots between 1 and maxSequence for each prefix,
 * and ensures all per-prefix counters (A-Z) are synchronized.
 */
export const syncJobNumberRegistryAndSequences = async () => {
  const ALPHABETS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  try {
    // 1. Fetch all customers with a non-empty jobNo
    const customersWithJobNo = await Customer.find({
      jobNo: { $exists: true, $ne: "" },
    })
      .select("_id fullName companyName phone jobNo isArchived")
      .lean();

    let newRegisteredCount = 0;
    let updatedCount = 0;

    for (const c of customersWithJobNo) {
      if (!c.jobNo || typeof c.jobNo !== "string") continue;
      const cleanJobNo = c.jobNo.trim().toUpperCase();
      if (!cleanJobNo) continue;

      const parsed = parseJobNo(cleanJobNo);
      const isArchived = Boolean(c.isArchived);

      const existingRecord = await JobNumber.findOne({ jobNo: cleanJobNo });

      if (!existingRecord) {
        const newRecord = new JobNumber({
          jobNo: cleanJobNo,
          prefix: parsed.prefix,
          sequence: parsed.sequence,
          status: isArchived ? "available" : "assigned",
          customerId: isArchived ? null : c._id,
          isLegacy: parsed.isLegacy,
          assignmentHistory: [
            {
              action: isArchived ? "released" : "assigned",
              customerId: c._id,
              customerName: c.fullName,
              timestamp: new Date(),
              reason: "Initial registry synchronization",
            },
          ],
        });
        await newRecord.save();
        newRegisteredCount++;
      } else {
        // Update customer link if currently assigned to active customer
        let changed = false;
        if (!isArchived && (!existingRecord.customerId || existingRecord.status !== "assigned")) {
          existingRecord.status = "assigned";
          existingRecord.customerId = c._id;
          changed = true;
        } else if (isArchived && existingRecord.status === "assigned" && String(existingRecord.customerId) === String(c._id)) {
          existingRecord.status = "available";
          existingRecord.customerId = null;
          changed = true;
        }

        // Add history entry if not already present
        const hasHistory = existingRecord.assignmentHistory?.some(
          (h) => String(h.customerId) === String(c._id)
        );
        if (!hasHistory) {
          existingRecord.assignmentHistory.push({
            action: isArchived ? "released" : "assigned",
            customerId: c._id,
            customerName: c.fullName,
            timestamp: new Date(),
            reason: "Registry synchronization customer match",
          });
          changed = true;
        }

        if (changed) {
          await existingRecord.save();
          updatedCount++;
        }
      }
    }

    // 2. Calculate maxSequence and identify vacant slots for standard prefixes A-Z
    let vacantCreatedCount = 0;

    for (const letter of ALPHABETS) {
      // Find all standard numbers in JobNumber for this letter
      const standardJobNumbers = await JobNumber.find({
        prefix: letter,
        isLegacy: false,
        sequence: { $ne: null },
      })
        .select("sequence")
        .lean();

      let maxSeq = 0;
      const occupiedSequences = new Set();

      for (const jn of standardJobNumbers) {
        occupiedSequences.add(jn.sequence);
        if (jn.sequence > maxSeq) {
          maxSeq = jn.sequence;
        }
      }

      // Also check customers for this prefix to ensure maxSeq covers all
      for (const c of customersWithJobNo) {
        const parsed = parseJobNo(c.jobNo);
        if (parsed.isStandard && parsed.prefix === letter && parsed.sequence !== null) {
          occupiedSequences.add(parsed.sequence);
          if (parsed.sequence > maxSeq) {
            maxSeq = parsed.sequence;
          }
        }
      }

      // Upsert into JobNumberSequence
      await JobNumberSequence.findOneAndUpdate(
        { prefix: letter },
        { $max: { maxSequence: maxSeq } },
        { upsert: true, returnDocument: "after" }
      );

      // Register vacant slots between 1 and maxSeq
      if (maxSeq > 0) {
        for (let s = 1; s <= maxSeq; s++) {
          if (!occupiedSequences.has(s)) {
            const vacantJobNo = `${letter}/${String(s).padStart(2, "0")}`;
            const existing = await JobNumber.findOne({ jobNo: vacantJobNo });
            if (!existing) {
              const vacantRecord = new JobNumber({
                jobNo: vacantJobNo,
                prefix: letter,
                sequence: s,
                status: "available",
                customerId: null,
                isLegacy: false,
                assignmentHistory: [
                  {
                    action: "vacant_registered",
                    reason: "Automatic vacancy registry initialization",
                    timestamp: new Date(),
                  },
                ],
              });
              await vacantRecord.save();
              vacantCreatedCount++;
              occupiedSequences.add(s);
            }
          }
        }
      }
    }

    const totalManaged = await JobNumber.countDocuments();
    const assigned = await JobNumber.countDocuments({ status: "assigned" });
    const available = await JobNumber.countDocuments({ status: "available" });
    const legacy = await JobNumber.countDocuments({ isLegacy: true });

    console.log(
      `Job Number registry sync complete: ${totalManaged} total slots (${assigned} assigned, ${available} available, ${legacy} legacy). Newly registered: ${newRegisteredCount}, Vacancies initialized: ${vacantCreatedCount}.`
    );

    return {
      success: true,
      totalManaged,
      assigned,
      available,
      legacy,
      newRegisteredCount,
      updatedCount,
      vacantCreatedCount,
      sequencesSynced: ALPHABETS.length,
    };
  } catch (err) {
    console.error("Warning syncing JobNumber registry and sequences:", err.message);
    throw err;
  }
};

/**
 * Backward-compatible wrapper for sequence synchronization.
 */
export const syncJobNumberSequences = async () => {
  return await syncJobNumberRegistryAndSequences();
};

/**
 * Preview the next Job Number that would be assigned for a prefix.
 */
export const getNextAvailablePreview = async (prefixInput) => {
  const prefix = (prefixInput && prefixInput.trim().toUpperCase()) || "C";

  // 1. Check for smallest vacant standard slot
  const vacantSlot = await JobNumber.findOne({
    prefix,
    status: "available",
    isLegacy: false,
    sequence: { $ne: null },
  })
    .sort({ sequence: 1 })
    .lean();

  if (vacantSlot) {
    return {
      jobNo: vacantSlot.jobNo,
      type: "reused_slot",
      sequence: vacantSlot.sequence,
    };
  }

  // 2. Next sequential number
  const seqDoc = await JobNumberSequence.findOne({ prefix }).lean();
  const maxSeq = seqDoc ? seqDoc.maxSequence : 0;
  const nextSeq = maxSeq + 1;
  const nextJobNo = `${prefix}/${String(nextSeq).padStart(2, "0")}`;

  return {
    jobNo: nextJobNo,
    type: "new_sequential",
    sequence: nextSeq,
  };
};

/**
 * Concurrency-safe atomic allocation of the smallest available Job Number.
 * Always selects the smallest available vacant slot first.
 * If no vacancy exists, increments the atomic per-prefix counter.
 */
export const allocateSmallestJobNo = async (
  prefixInput,
  customerId,
  customerName = "",
  session = null
) => {
  const prefix = (prefixInput && prefixInput.trim().toUpperCase()) || "C";
  const options = session ? { session } : {};

  // 1. Attempt atomic claim of the smallest vacant slot
  const vacantSlot = await JobNumber.findOneAndUpdate(
    {
      prefix,
      status: "available",
      isLegacy: false,
      sequence: { $ne: null },
    },
    {
      $set: {
        status: "assigned",
        customerId,
      },
      $push: {
        assignmentHistory: {
          action: "assigned",
          customerId,
          customerName,
          timestamp: new Date(),
          reason: "Automatic smallest available allocation",
        },
      },
    },
    {
      sort: { sequence: 1 },
      returnDocument: "after",
      ...options,
    }
  );

  if (vacantSlot) {
    return vacantSlot.jobNo;
  }

  // 2. No vacancy: atomically increment per-prefix counter
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    attempts++;

    const seqDoc = await JobNumberSequence.findOneAndUpdate(
      { prefix },
      { $inc: { maxSequence: 1 } },
      {
        upsert: true,
        returnDocument: "after",
        ...options,
      }
    );

    const nextSeq = seqDoc.maxSequence;
    const nextJobNo = `${prefix}/${String(nextSeq).padStart(2, "0")}`;

    try {
      const newJobRecord = new JobNumber({
        jobNo: nextJobNo,
        prefix,
        sequence: nextSeq,
        status: "assigned",
        customerId,
        isLegacy: false,
        assignmentHistory: [
          {
            action: "assigned",
            customerId,
            customerName,
            timestamp: new Date(),
            reason: "Sequential next allocation (no vacancies)",
          },
        ],
      });

      await newJobRecord.save(options);
      return nextJobNo;
    } catch (saveErr) {
      // If collision occurs (e.g. legacy or imported record already had this exact string), retry next number
      if (saveErr.code === 11000) {
        continue;
      }
      throw saveErr;
    }
  }

  throw new Error(`Failed to allocate a unique Job Number for prefix ${prefix} after multiple attempts.`);
};

/**
 * Manually allocate or override a Job Number.
 * Validates availability and uniqueness. Never overwrites an active assignment.
 */
export const manualAllocateJobNo = async (
  requestedJobNoInput,
  customerId,
  customerName = "",
  session = null
) => {
  if (!requestedJobNoInput || typeof requestedJobNoInput !== "string") {
    throw new Error("Job Number is required for manual allocation.");
  }

  const cleanJobNo = requestedJobNoInput.trim().toUpperCase();
  const parsed = parseJobNo(cleanJobNo);
  const options = session ? { session } : {};

  // Check if JobNumber record already exists
  const existingJobRecord = await JobNumber.findOne({ jobNo: cleanJobNo }).session(session);

  if (existingJobRecord) {
    if (
      existingJobRecord.status === "assigned" &&
      existingJobRecord.customerId &&
      String(existingJobRecord.customerId) !== String(customerId)
    ) {
      throw new Error(`Job Number ${cleanJobNo} is already assigned to another customer.`);
    }

    // Atomically claim available slot
    existingJobRecord.status = "assigned";
    existingJobRecord.customerId = customerId;
    existingJobRecord.assignmentHistory.push({
      action: "manual_override",
      customerId,
      customerName,
      timestamp: new Date(),
      reason: "Manual allocation of existing slot",
    });

    await existingJobRecord.save(options);
    return cleanJobNo;
  }

  // Check if active Customer in DB already holds this jobNo
  const existingCustomerWithJob = await Customer.findOne({
    jobNo: cleanJobNo,
    _id: { $ne: customerId },
    isArchived: { $ne: true },
  }).session(session);

  if (existingCustomerWithJob) {
    throw new Error(`Job Number ${cleanJobNo} is already in use by customer: ${existingCustomerWithJob.fullName}.`);
  }

  // Create new record
  const newJobRecord = new JobNumber({
    jobNo: cleanJobNo,
    prefix: parsed.prefix,
    sequence: parsed.sequence,
    status: "assigned",
    customerId,
    isLegacy: parsed.isLegacy,
    assignmentHistory: [
      {
        action: "manual_override",
        customerId,
        customerName,
        timestamp: new Date(),
        reason: "Manual allocation of new slot",
      },
    ],
  });

  await newJobRecord.save(options);

  // If standard sequence exceeds current maxSequence, update counter
  if (parsed.isStandard && parsed.sequence !== null) {
    await JobNumberSequence.findOneAndUpdate(
      { prefix: parsed.prefix },
      { $max: { maxSequence: parsed.sequence } },
      { upsert: true, ...options }
    );
  }

  return cleanJobNo;
};

/**
 * Releases a Job Number when a customer is removed or archived.
 * Marks the Job Number as available for future reuse.
 */
export const releaseJobNo = async (
  jobNoInput,
  customerId,
  reason = "Customer removed/archived",
  session = null
) => {
  if (!jobNoInput) return null;
  const cleanJobNo = jobNoInput.trim().toUpperCase();
  const options = session ? { session } : {};

  const jobRecord = await JobNumber.findOne({ jobNo: cleanJobNo }).session(session);

  if (jobRecord) {
    jobRecord.status = "available";
    jobRecord.customerId = null;
    jobRecord.assignmentHistory.push({
      action: "released",
      customerId,
      timestamp: new Date(),
      reason,
    });
    await jobRecord.save(options);
    return jobRecord;
  }

  // If no record existed in JobNumber collection, register it as available
  const parsed = parseJobNo(cleanJobNo);
  const newAvailable = new JobNumber({
    jobNo: cleanJobNo,
    prefix: parsed.prefix,
    sequence: parsed.sequence,
    status: "available",
    customerId: null,
    isLegacy: parsed.isLegacy,
    assignmentHistory: [
      {
        action: "released",
        customerId,
        timestamp: new Date(),
        reason,
      },
    ],
  });

  await newAvailable.save(options);
  return newAvailable;
};

/**
 * Restores a customer's Job Number.
 * If previous Job Number is available, reclaims it.
 * If previous Job Number is taken, allocates smallest available vacancy for prefix.
 */
export const restoreJobNo = async (
  previousJobNoInput,
  customerId,
  customerName = "",
  prefixInput = null,
  session = null
) => {
  const options = session ? { session } : {};

  if (previousJobNoInput) {
    const cleanJobNo = previousJobNoInput.trim().toUpperCase();
    const existingSlot = await JobNumber.findOne({ jobNo: cleanJobNo }).session(session);

    if (existingSlot && existingSlot.status === "available") {
      existingSlot.status = "assigned";
      existingSlot.customerId = customerId;
      existingSlot.assignmentHistory.push({
        action: "restored",
        customerId,
        customerName,
        timestamp: new Date(),
        reason: "Customer restored with original Job Number",
      });
      await existingSlot.save(options);

      return {
        jobNo: cleanJobNo,
        restoredOriginal: true,
        message: `Restored with original Job Number ${cleanJobNo}.`,
      };
    }
  }

  // Original number is occupied or not provided: allocate smallest available
  const prefix = prefixInput || getPrefixFromName(customerName) || "C";
  const newJobNo = await allocateSmallestJobNo(prefix, customerId, customerName, session);

  return {
    jobNo: newJobNo,
    restoredOriginal: false,
    message: previousJobNoInput
      ? `Original Job Number ${previousJobNoInput} is currently occupied. Assigned new Job Number ${newJobNo}.`
      : `Assigned Job Number ${newJobNo}.`,
  };
};
