
import { type HydratedDocument, type Model, model, models, Schema } from "mongoose";

export interface IUser {
  name: string;
  email: string;
  passwordHash: string;
  role: "admin";
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ["admin"],
      default: "admin",
      required: true,
    },
  },
  { timestamps: true },
);

export type UserDocument = HydratedDocument<IUser>;

export const User = (models.User as Model<IUser> | undefined) ?? model<IUser>("User", userSchema);
