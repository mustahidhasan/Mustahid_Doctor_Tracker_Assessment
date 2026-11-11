
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

patientSchema.index({ doctorId: 1, createdAt: -1 });
patientSchema.index({ condition: 1 });
patientSchema.index({ name: 1 });
patientSchema.index({ createdAt: -1 });

export type PatientDocument = HydratedDocument<IPatient>;
export const Patient = (models.Patient as Model<IPatient> | undefined) ?? model<IPatient>("Patient", patientSchema);
