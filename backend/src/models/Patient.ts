
import mongoose, { type HydratedDocument, type Model, type Types } from "mongoose";

const { Schema, model, models } = mongoose;

export interface IPatient {
  name: string;
  doctorId: Types.ObjectId;
  condition: string;
  phone?: string;
  email?: string;
  createdAt: Date;
  updatedAt: Date;
}

const patientSchema = new Schema<IPatient>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
    },
    condition: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
  },
  { timestamps: true },
);

// Indexes matched to the real query patterns (all list sorts end with an `_id` tiebreaker):
// - { doctorId: 1, createdAt: -1, _id: -1 }: a doctor's patients newest-first, the doctor filter,
//   distinct(doctorId), and the delete-restriction check.
// - { createdAt: -1, _id: -1 }: default "newest"/"oldest" list sort, date ranges, dashboard trends.
// - { name: 1, _id: 1 }: name A–Z / Z–A sorts.
// - { condition: 1 }: condition filter and distinct() for filter options.
patientSchema.index({ doctorId: 1, createdAt: -1, _id: -1 });
patientSchema.index({ createdAt: -1, _id: -1 });
patientSchema.index({ name: 1, _id: 1 });
patientSchema.index({ condition: 1 });

export type PatientDocument = HydratedDocument<IPatient>;
export const Patient = (models.Patient as Model<IPatient> | undefined) ?? model<IPatient>("Patient", patientSchema);
