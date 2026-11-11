
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

// Indexes. Every list sort uses `_id` as a tiebreaker for stable pagination, so the sort indexes
// include `_id`; otherwise MongoDB scans the whole collection and sorts in memory on every page.
// - { createdAt: -1, _id: -1 }: default "newest" sort (walked backwards for "oldest"), created-date
//   ranges, and dashboard period counts.
// - { name: 1, _id: 1 }: name sort.
// - specialization / hospital: exact-match filters and distinct() for the filter options.
// Email is only searched by substring regex, which a B-tree index cannot serve, so it has no index.
doctorSchema.index({ createdAt: -1, _id: -1 });
doctorSchema.index({ name: 1, _id: 1 });
doctorSchema.index({ specialization: 1 });
doctorSchema.index({ hospital: 1 });

export type DoctorDocument = HydratedDocument<IDoctor>;
export const Doctor = (models.Doctor as Model<IDoctor> | undefined) ?? model<IDoctor>("Doctor", doctorSchema);
