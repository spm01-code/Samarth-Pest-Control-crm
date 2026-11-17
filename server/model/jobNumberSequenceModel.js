import mongoose from "mongoose";

const jobNumberSequenceSchema = new mongoose.Schema(
  {
    prefix: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    maxSequence: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

const JobNumberSequence = mongoose.model(
  "JobNumberSequence",
  jobNumberSequenceSchema
);

export default JobNumberSequence;
