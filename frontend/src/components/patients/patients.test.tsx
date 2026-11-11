import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import * as api from "@/lib/patients";
import { PatientDetails } from "./PatientDetails";
import { PatientsManager } from "./PatientsManager";

const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: routerReplace, push: vi.fn(), refresh: vi.fn() }) }));

vi.mock("@/lib/patients", async (original) => {
  const actual = await original<typeof import("@/lib/patients")>();
  return { ...actual, listPatients: vi.fn(), getPatientFilterOptions: vi.fn(), getPatient: vi.fn(), createPatient: vi.fn(), updatePatient: vi.fn(), deletePatient: vi.fn() };
});

const DOCTOR_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const DOCTOR_B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const PATIENT = "cccccccccccccccccccccccc";
const patient: api.PatientRecord = {
  _id: PATIENT, doctorId: DOCTOR_A, doctor: { _id: DOCTOR_A, name: "Dr. Ada", specialization: "Cardiology", hospital: "City Hospital" },
  name: "Pat Lee", condition: "Hypertension", phone: "+1 555 0100 1234", email: "pat@example.com",
  createdAt: "2026-03-01T10:00:00.000Z", updatedAt: "2026-04-02T12:30:00.000Z",
};
const pagination = { page: 1, limit: 10, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false };
const filterOptions: api.PatientFilterOptions = {
  conditions: ["Asthma", "Hypertension"],
  doctors: [{ _id: DOCTOR_A, name: "Dr. Ada", specialization: "Cardiology" }, { _id: DOCTOR_B, name: "Dr. Bea", specialization: "Neurology" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listPatients).mockResolvedValue({ data: [patient], pagination });
  vi.mocked(api.getPatientFilterOptions).mockResolvedValue(filterOptions);
  vi.mocked(api.getPatient).mockResolvedValue(patient);
  vi.mocked(api.createPatient).mockResolvedValue(patient);
  vi.mocked(api.updatePatient).mockResolvedValue(patient);
  vi.mocked(api.deletePatient).mockResolvedValue();
});
afterEach(cleanup);

const lastQuery = () => vi.mocked(api.listPatients).mock.lastCall![0];
const renderList = async (props: { initialDoctorId?: string } = {}) => {
  render(<PatientsManager {...props} />);
  await screen.findAllByText("Pat Lee");
  await waitFor(() => expect(api.getPatientFilterOptions).toHaveBeenCalled());
};
const choose = async (menu: string, option: string | RegExp, scope: ReturnType<typeof within> | typeof screen = screen) => {
  fireEvent.click(scope.getByRole("button", { name: new RegExp(`^${menu}:`) }));
  fireEvent.click(await within(screen.getByRole("listbox", { name: menu })).findByRole("option", { name: option }));
};

describe("PatientsManager list", () => {
  it("shows a skeleton, then patients with their assigned doctor", async () => {
    render(<PatientsManager />);
    expect(screen.getByRole("status", { name: "Loading patients" })).toBeInTheDocument();
    expect((await screen.findAllByRole("link", { name: "Pat Lee" }))[0]).toHaveAttribute("href", `/patients/${PATIENT}`);
    expect(screen.getAllByRole("link", { name: "Dr. Ada" })[0]).toHaveAttribute("href", `/doctors/${DOCTOR_A}`);
    expect(screen.getAllByText("Hypertension").length).toBeGreaterThan(0);
    expect(api.listPatients).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 10, sort: "newest" }), expect.any(AbortSignal));
  });

  it("debounces search into a single request", async () => {
    await renderList();
    const before = vi.mocked(api.listPatients).mock.calls.length;
    const search = screen.getByLabelText("Search patients");
    for (const value of ["f", "fe", "fever"]) fireEvent.change(search, { target: { value } });
    await waitFor(() => expect(lastQuery()).toMatchObject({ search: "fever", page: 1 }), { timeout: 1500 });
    expect(vi.mocked(api.listPatients).mock.calls.length).toBe(before + 1);
  });

  it("filters by condition, doctor, date range, and sort", async () => {
    await renderList();
    await choose("Filter condition", "Asthma");
    await waitFor(() => expect(lastQuery()).toMatchObject({ condition: "Asthma" }));
    await choose("Filter doctor", /Dr\. Bea/);
    fireEvent.change(screen.getByLabelText("Created from"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("Created to"), { target: { value: "2026-06-30" } });
    await choose("Sort patients", "Name Z–A");
    await waitFor(() => expect(lastQuery()).toMatchObject({ condition: "Asthma", doctorId: DOCTOR_B, dateFrom: "2026-01-01", dateTo: "2026-06-30", sort: "name_desc", page: 1 }));
  });

  it("searches inside the doctor filter", async () => {
    await renderList();
    fireEvent.click(screen.getByRole("button", { name: /^Filter doctor:/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "Filter doctor search" }), { target: { value: "neuro" } });
    const options = within(screen.getByRole("listbox", { name: "Filter doctor" })).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["Dr. Bea · Neurology"]);
  });

  it("pre-filters by doctor from the URL", async () => {
    await renderList({ initialDoctorId: DOCTOR_A });
    expect(api.listPatients).toHaveBeenCalledWith(expect.objectContaining({ doctorId: DOCTOR_A }), expect.any(AbortSignal));
    expect(screen.getByRole("button", { name: /^Filter doctor:/ })).toHaveTextContent("Dr. Ada");
  });

  it("ignores an invalid doctor ID from the URL", async () => {
    await renderList({ initialDoctorId: "not-an-id" });
    expect(lastQuery().doctorId).toBe("");
  });

  it("blocks an invalid date range without requesting", async () => {
    await renderList();
    fireEvent.change(screen.getByLabelText("Created from"), { target: { value: "2026-05-01" } });
    await waitFor(() => expect(lastQuery()).toMatchObject({ dateFrom: "2026-05-01" }));
    const before = vi.mocked(api.listPatients).mock.calls.length;
    fireEvent.change(screen.getByLabelText("Created to"), { target: { value: "2026-04-01" } });
    expect(await screen.findByText("The start date must be on or before the end date.")).toBeInTheDocument();
    expect(vi.mocked(api.listPatients).mock.calls.length).toBe(before);
  });

  it("paginates", async () => {
    vi.mocked(api.listPatients).mockImplementation(async (query) => ({ data: [patient], pagination: { page: query.page, limit: 10, total: 25, totalPages: 3, hasNextPage: query.page < 3, hasPreviousPage: query.page > 1 } }));
    await renderList();
    expect(screen.getByText(/of/, { selector: "p" })).toHaveTextContent("25 patients");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Page 2 of 3")).toBeInTheDocument();
    expect(lastQuery()).toMatchObject({ page: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 1 }));
  });

  it("shows distinct empty states", async () => {
    vi.mocked(api.listPatients).mockResolvedValue({ data: [], pagination: { ...pagination, total: 0, totalPages: 0 } });
    render(<PatientsManager />);
    expect(await screen.findByText("No patients yet")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search patients"), { target: { value: "zzz" } });
    expect(await screen.findByText("No patients match your filters", {}, { timeout: 1500 })).toBeInTheDocument();
  });

  it("shows an error state and retries", async () => {
    vi.mocked(api.listPatients).mockRejectedValueOnce(new Error("Network unavailable"));
    render(<PatientsManager />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Network unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect((await screen.findAllByText("Pat Lee")).length).toBeGreaterThan(0);
  });
});

describe("PatientsManager create, edit, delete", () => {
  const fill = (values: Record<string, string>) => {
    const dialog = within(screen.getByRole("dialog"));
    for (const [label, value] of Object.entries(values)) fireEvent.change(dialog.getByLabelText(label, { exact: false }), { target: { value } });
  };

  it("validates required fields including the assigned doctor", async () => {
    await renderList();
    fireEvent.click(screen.getByRole("button", { name: /Add patient/ }));
    const dialog = within(screen.getByRole("dialog", { name: "Add patient" }));
    fireEvent.click(dialog.getByRole("button", { name: "Add patient" }));
    expect(dialog.getByText("Name is required")).toBeInTheDocument();
    expect(dialog.getByText("Condition is required")).toBeInTheDocument();
    expect(dialog.getByText("Assigned doctor is required")).toBeInTheDocument();
    fill({ Name: "New Patient", Condition: "Asthma", Email: "bad", Phone: "12" });
    fireEvent.click(dialog.getByRole("button", { name: "Add patient" }));
    expect(dialog.getByText("Enter a valid email address")).toBeInTheDocument();
    expect(dialog.getByText("Phone must contain 7 to 15 digits")).toBeInTheDocument();
    expect(api.createPatient).not.toHaveBeenCalled();
  });

  it("creates a patient with a searched doctor, then notifies and refreshes", async () => {
    await renderList();
    const before = vi.mocked(api.listPatients).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /Add patient/ }));
    const dialog = within(screen.getByRole("dialog"));
    fill({ Name: "  New Patient ", Condition: "Asthma" });
    fireEvent.click(dialog.getByRole("button", { name: /^Assigned doctor:/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "Assigned doctor search" }), { target: { value: "bea" } });
    fireEvent.click(screen.getByRole("option", { name: /Dr\. Bea/ }));
    fireEvent.click(dialog.getByRole("button", { name: "Add patient" }));
    await waitFor(() => expect(api.createPatient).toHaveBeenCalledWith({ name: "New Patient", condition: "Asthma", doctorId: DOCTOR_B, phone: "", email: "" }));
    expect(await screen.findByText("New Patient was added.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(api.listPatients).mock.calls.length).toBeGreaterThan(before));
  });

  it("prevents duplicate submissions while saving", async () => {
    let resolve!: (value: api.PatientRecord) => void;
    vi.mocked(api.createPatient).mockReturnValue(new Promise((done) => { resolve = done; }));
    await renderList();
    fireEvent.click(screen.getByRole("button", { name: /Add patient/ }));
    const dialog = within(screen.getByRole("dialog"));
    fill({ Name: "New Patient", Condition: "Asthma" });
    await choose("Assigned doctor", /Dr\. Ada/, dialog);
    fireEvent.click(dialog.getByRole("button", { name: "Add patient" }));
    const saving = await dialog.findByRole("button", { name: "Saving…" });
    expect(saving).toBeDisabled();
    fireEvent.click(saving);
    expect(api.createPatient).toHaveBeenCalledTimes(1);
    await act(async () => resolve(patient));
  });

  it("shows a backend error for a nonexistent doctor inline", async () => {
    vi.mocked(api.createPatient).mockRejectedValue(new ApiError("Assigned doctor does not exist", 400, [{ field: "doctorId", message: "Select an existing doctor" }]));
    await renderList();
    fireEvent.click(screen.getByRole("button", { name: /Add patient/ }));
    const dialog = within(screen.getByRole("dialog"));
    fill({ Name: "New Patient", Condition: "Asthma" });
    await choose("Assigned doctor", /Dr\. Ada/, dialog);
    fireEvent.click(dialog.getByRole("button", { name: "Add patient" }));
    expect(await dialog.findByText("Select an existing doctor")).toBeInTheDocument();
  });

  it("edits and reassigns a patient with prefilled values", async () => {
    await renderList();
    fireEvent.click(screen.getAllByRole("button", { name: "Edit Pat Lee" })[0]!);
    const dialog = within(screen.getByRole("dialog", { name: "Edit patient" }));
    expect(dialog.getByLabelText("Condition", { exact: false })).toHaveValue("Hypertension");
    expect(dialog.getByRole("button", { name: /^Assigned doctor:/ })).toHaveTextContent("Dr. Ada");
    await choose("Assigned doctor", /Dr\. Bea/, dialog);
    fill({ Email: "" });
    fireEvent.click(dialog.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updatePatient).toHaveBeenCalledWith(PATIENT, { name: "Pat Lee", condition: "Hypertension", doctorId: DOCTOR_B, phone: "+1 555 0100 1234", email: "" }));
    expect(await screen.findByText("Pat Lee was reassigned and updated.")).toBeInTheDocument();
  });

  it("deletes only after confirmation", async () => {
    await renderList();
    fireEvent.click(screen.getAllByRole("button", { name: "Delete Pat Lee" })[0]!);
    const dialog = within(screen.getByRole("dialog", { name: "Delete Pat Lee?" }));
    expect(dialog.getByText(/removes them from Dr\. Ada's list/)).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    expect(api.deletePatient).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Delete Pat Lee" })[0]!);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete patient" }));
    await waitFor(() => expect(api.deletePatient).toHaveBeenCalledWith(PATIENT));
    expect(await screen.findByText("Pat Lee was deleted.")).toBeInTheDocument();
  });
});

describe("PatientDetails", () => {
  it("shows a loading state, then every patient field and a doctor link", async () => {
    render(<PatientDetails id={PATIENT} />);
    expect(screen.getByRole("status", { name: "Loading patient" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Pat Lee" })).toBeInTheDocument();
    expect(screen.getByText("Hypertension")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Dr\. Ada/ })).toHaveAttribute("href", `/doctors/${DOCTOR_A}`);
    expect(screen.getByText("Cardiology · City Hospital")).toBeInTheDocument();
    expect(screen.getByText("+1 555 0100 1234")).toBeInTheDocument();
    expect(screen.getByText("pat@example.com")).toBeInTheDocument();
    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.getByText("Last updated")).toBeInTheDocument();
  });

  it("shows not found without retry", async () => {
    vi.mocked(api.getPatient).mockRejectedValue(new ApiError("Patient not found", 404));
    render(<PatientDetails id={PATIENT} />);
    expect(await screen.findByRole("heading", { name: "Patient not found" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("retries after a load error", async () => {
    vi.mocked(api.getPatient).mockRejectedValueOnce(new ApiError("Server unavailable", 500));
    render(<PatientDetails id={PATIENT} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Server unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Pat Lee" })).toBeInTheDocument();
  });

  it("reassigns to another doctor and updates the view", async () => {
    vi.mocked(api.updatePatient).mockResolvedValue({ ...patient, doctorId: DOCTOR_B, doctor: { _id: DOCTOR_B, name: "Dr. Bea", specialization: "Neurology", hospital: "North" } });
    render(<PatientDetails id={PATIENT} />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const dialog = within(screen.getByRole("dialog"));
    await waitFor(() => expect(api.getPatientFilterOptions).toHaveBeenCalled());
    await choose("Assigned doctor", /Dr\. Bea/, dialog);
    fireEvent.click(dialog.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Reassigned to Dr. Bea.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Dr\. Bea/ })).toHaveAttribute("href", `/doctors/${DOCTOR_B}`);
  });

  it("deletes after confirmation and returns to the list", async () => {
    render(<PatientDetails id={PATIENT} />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete patient" }));
    await waitFor(() => expect(api.deletePatient).toHaveBeenCalledWith(PATIENT));
    expect(routerReplace).toHaveBeenCalledWith("/patients");
  });
});

describe("patient form validation", () => {
  it("mirrors the backend rules", () => {
    expect(api.validatePatientForm({ name: "A", condition: "B", doctorId: DOCTOR_A, phone: "", email: "" })).toEqual({});
    expect(api.validatePatientForm({ name: "", condition: "", doctorId: "", phone: "x", email: "y" })).toEqual({
      name: "Name is required", condition: "Condition is required", doctorId: "Assigned doctor is required",
      phone: expect.any(String), email: "Enter a valid email address",
    });
    expect(api.validatePatientForm({ name: "A", condition: "B", doctorId: "123", phone: "", email: "" }).doctorId).toBe("Select a valid doctor");
  });
});

describe("PatientsManager edge cases", () => {
  it("ignores an older, slower search response that arrives after a newer one", async () => {
    let releaseSlow!: (value: api.PatientList) => void;
    vi.mocked(api.listPatients).mockImplementation((query, signal) => {
      if (query.search === "pa") return new Promise((resolve, reject) => { releaseSlow = resolve; signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))); });
      if (query.search === "newer") return Promise.resolve({ data: [{ ...patient, _id: "p2", name: "Newer Patient" }], pagination });
      return Promise.resolve({ data: [patient], pagination });
    });
    await renderList();
    fireEvent.change(screen.getByLabelText("Search patients"), { target: { value: "pa" } });
    await waitFor(() => expect(lastQuery()).toMatchObject({ search: "pa" }), { timeout: 1500 });
    fireEvent.change(screen.getByLabelText("Search patients"), { target: { value: "newer" } });
    expect((await screen.findAllByText("Newer Patient", {}, { timeout: 1500 })).length).toBeGreaterThan(0);
    await act(async () => releaseSlow({ data: [{ ...patient, name: "Stale Patient" }], pagination }));
    expect(screen.queryByText("Stale Patient")).not.toBeInTheDocument();
  });

  it("refreshes the list and filter options after reassigning a patient", async () => {
    vi.mocked(api.listPatients)
      .mockResolvedValueOnce({ data: [patient], pagination })
      .mockResolvedValue({ data: [{ ...patient, doctorId: DOCTOR_B, doctor: { _id: DOCTOR_B, name: "Dr. Bea", specialization: "Neurology", hospital: "North" } }], pagination });
    await renderList();
    const optionCalls = vi.mocked(api.getPatientFilterOptions).mock.calls.length;
    fireEvent.click(screen.getAllByRole("button", { name: "Edit Pat Lee" })[0]!);
    const dialog = within(screen.getByRole("dialog"));
    await choose("Assigned doctor", /Dr\. Bea/, dialog);
    fireEvent.click(dialog.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updatePatient).toHaveBeenCalledWith(PATIENT, expect.objectContaining({ doctorId: DOCTOR_B })));
    // The row now shows the new doctor, without a manual reload.
    expect((await screen.findAllByRole("link", { name: "Dr. Bea" }))[0]).toHaveAttribute("href", `/doctors/${DOCTOR_B}`);
    expect(screen.queryByRole("link", { name: "Dr. Ada" })).not.toBeInTheDocument();
    expect(vi.mocked(api.getPatientFilterOptions).mock.calls.length).toBeGreaterThan(optionCalls);
  });
});
