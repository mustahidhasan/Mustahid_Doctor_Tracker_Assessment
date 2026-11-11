
import mongoose, { type HydratedDocument, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

export interface IDoctor {
  name: string;
  specialization: string;
  hospital: string;
  phone: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

const doctorSchema = new Schema<IDoctor>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    specialization: {
      type: String,
      required: true,
      trim: true,
    },
    hospital: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
  },
  { timestamps: true },
);

// Indexes for filtering and sorting. Exact-match filters (specialization,
// hospital), distinct() lookups for filter options, name sort, and created-date
// sort/range all use these. Email is searched only via substring regex, which
// cannot use a B-tree index, so no email index is created.
doctorSchema.index({ name: 1 });
doctorSchema.index({ specialization: 1 });
doctorSchema.index({ hospital: 1 });
doctorSchema.index({ createdAt: -1 });

export type DoctorDocument = HydratedDocument<IDoctor>;
export const Doctor = (models.Doctor as Model<IDoctor> | undefined) ?? model<IDoctor>("Doctor", doctorSchema);
