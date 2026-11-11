import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/lib/doctors";
import { DoctorDetails } from "./DoctorDetails";
import { DoctorsManager } from "./DoctorsManager";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: routerReplace, push: vi.fn(), refresh: vi.fn() }) }));
const routerReplace = vi.fn();

vi.mock("@/lib/doctors", async (original) => {
  const actual = await original<typeof import("@/lib/doctors")>();
  return {
    ...actual,
    listDoctors: vi.fn(), getDoctorFilterOptions: vi.fn(), createDoctor: vi.fn(), updateDoctor: vi.fn(), deleteDoctor: vi.fn(),
    getDoctor: vi.fn(), listDoctorPatients: vi.fn(), addDoctorPatient: vi.fn(), deleteDoctorPatient: vi.fn(),
  };
});

const doctor: api.Doctor = { _id: "d1", name: "Dr. Ada", specialization: "Cardiology", hospital: "City Hospital", phone: "01700000000", email: "ada@example.com", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
const patient: api.Patient = { _id: "p1", doctorId: "d1", name: "Patient One", condition: "Follow-up", createdAt: doctor.createdAt, updatedAt: doctor.updatedAt };
const pagination: api.Pagination = { page: 1, limit: 10, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false };
const patientList = (data: api.Patient[]): api.DoctorPatientList => ({ data, total: data.length, limit: 100 });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listDoctors).mockResolvedValue({ data: [doctor], pagination });
  vi.mocked(api.getDoctorFilterOptions).mockResolvedValue({ specializations: ["Cardiology", "Neurology"], hospitals: ["City Hospital"] });
  vi.mocked(api.createDoctor).mockResolvedValue(doctor);
  vi.mocked(api.updateDoctor).mockResolvedValue(doctor);
  vi.mocked(api.deleteDoctor).mockResolvedValue();
  vi.mocked(api.getDoctor).mockResolvedValue(doctor);
  vi.mocked(api.listDoctorPatients).mockResolvedValue(patientList([]));
  vi.mocked(api.addDoctorPatient).mockResolvedValue(patient);
  vi.mocked(api.deleteDoctorPatient).mockResolvedValue();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const lastQuery = () => vi.mocked(api.listDoctors).mock.lastCall![0];
const renderList = async () => { render(<DoctorsManager />); await screen.findAllByText("Dr. Ada"); };
/** Opens a custom SelectMenu by its accessible name and picks an option. */
const choose = (menu: string, option: string) => {
  fireEvent.click(screen.getByRole("button", { name: menu }));
  fireEvent.click(within(screen.getByRole("listbox", { name: menu })).getByRole("option", { name: option }));
};

describe("DoctorsManager list", () => {
  it("shows a loading skeleton, then renders doctors", async () => {
    render(<DoctorsManager />);
    expect(screen.getByRole("status", { name: "Loading doctors" })).toBeInTheDocument();
    expect((await screen.findAllByText("Dr. Ada")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("status", { name: "Loading doctors" })).not.toBeInTheDocument();
    expect(screen.getAllByText("City Hospital").length).toBeGreaterThan(0);
    expect(api.listDoctors).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 10, sort: "newest" }), expect.any(AbortSignal));
  });

  it("debounces search into a single request", async () => {
    await renderList();
    const calls = vi.mocked(api.listDoctors).mock.calls.length;
    const search = screen.getByLabelText("Search doctors");
    fireEvent.change(search, { target: { value: "c" } });
    fireEvent.change(search, { target: { value: "ca" } });
    fireEvent.change(search, { target: { value: "cardio" } });
    await waitFor(() => expect(lastQuery()).toMatchObject({ search: "cardio", page: 1 }), { timeout: 1500 });
    expect(vi.mocked(api.listDoctors).mock.calls.length).toBe(calls + 1);
  });

  it("applies specialization, hospital, date, and sort filters", async () => {
    await renderList();
    await waitFor(() => expect(api.getDoctorFilterOptions).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Filter specialization" }));
    expect(await screen.findByRole("option", { name: "Neurology" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Neurology" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter specialization" })).toHaveTextContent("Neurology");
    await waitFor(() => expect(lastQuery()).toMatchObject({ specialization: "Neurology" }));
    choose("Filter hospital", "City Hospital");
    fireEvent.change(screen.getByLabelText("Created from"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("Created to"), { target: { value: "2026-01-31" } });
    choose("Sort doctors", "Name A–Z");
    await waitFor(() => expect(lastQuery()).toMatchObject({ specialization: "Neurology", hospital: "City Hospital", dateFrom: "2026-01-01", dateTo: "2026-01-31", sort: "name" }));
  });

  it("does not request an invalid date range and explains why", async () => {
    await renderList();
    fireEvent.change(screen.getByLabelText("Created from"), { target: { value: "2026-02-01" } });
    await waitFor(() => expect(lastQuery()).toMatchObject({ dateFrom: "2026-02-01" }));
    const calls = vi.mocked(api.listDoctors).mock.calls.length;
    fireEvent.change(screen.getByLabelText("Created to"), { target: { value: "2026-01-01" } });
    expect(await screen.findByText("The start date must be on or before the end date.")).toBeInTheDocument();
    expect(vi.mocked(api.listDoctors).mock.calls.length).toBe(calls);
  });

  it("moves between pages", async () => {
    vi.mocked(api.listDoctors).mockImplementation(async (query) => ({ data: [doctor], pagination: { page: query.page, limit: 10, total: 11, totalPages: 2, hasNextPage: query.page < 2, hasPreviousPage: query.page > 1 } }));
    await renderList();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 2 }));
    expect(await screen.findByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 1 }));
  });

  it("resets to page 1 when filters change", async () => {
    vi.mocked(api.listDoctors).mockResolvedValue({ data: [doctor], pagination: { ...pagination, total: 11, totalPages: 2, hasNextPage: true } });
    await renderList();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 2 }));
    choose("Sort doctors", "Oldest first");
    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 1, sort: "oldest" }));
  });

  it("shows distinct empty states for no data and no matches", async () => {
    vi.mocked(api.listDoctors).mockResolvedValue({ data: [], pagination: { ...pagination, total: 0, totalPages: 0 } });
    render(<DoctorsManager />);
    expect(await screen.findByText("No doctors yet")).toBeInTheDocument();
    await waitFor(() => expect(api.getDoctorFilterOptions).toHaveBeenCalled());
    await waitFor(() => { fireEvent.click(screen.getByRole("button", { name: "Filter specialization" })); expect(screen.getByRole("option", { name: "Cardiology" })).toBeInTheDocument(); });
    fireEvent.click(screen.getByRole("option", { name: "Cardiology" }));
    expect(await screen.findByText("No doctors match your filters")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]!);
    expect(await screen.findByText("No doctors yet")).toBeInTheDocument();
  });

  it("shows an error state and recovers on retry", async () => {
    vi.mocked(api.listDoctors).mockRejectedValueOnce(new Error("Network unavailable"));
    render(<DoctorsManager />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Network unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect((await screen.findAllByText("Dr. Ada")).length).toBeGreaterThan(0);
  });
});

describe("DoctorsManager create, edit, delete", () => {
  const fill = (values: Record<string, string>) => {
    const dialog = within(screen.getByRole("dialog"));
    for (const [label, value] of Object.entries(values)) fireEvent.change(dialog.getByLabelText(label, { exact: false }), { target: { value } });
  };
  const validDoctor = { Name: "Dr. New", Specialization: "Neurology", Hospital: "Central", Phone: "+1 555 010 2000", Email: "new@example.com" };

  it("validates required fields, email, and phone before submitting", async () => {
    await renderList();
    fireEvent.click(screen.getByRole("button", { name: /Add doctor/ }));
    const dialog = screen.getByRole("dialog", { name: "Add doctor" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add doctor" }));
    expect(within(dialog).getByText("Name is required")).toBeInTheDocument();
    expect(within(dialog).getByText("Email is required")).toBeInTheDocument();
    fill({ ...validDoctor, Email: "not-an-email", Phone: "12" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add doctor" }));
    expect(within(dialog).getByText("Enter a valid email address")).toBeInTheDocument();
    expect(within(dialog).getByText("Phone must contain 7 to 15 digits")).toBeInTheDocument();
    expect(api.createDoctor).not.toHaveBeenCalled();
  });

  it("creates a doctor, closes the form, notifies, and refreshes the list", async () => {
    await renderList();
    const before = vi.mocked(api.listDoctors).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /Add doctor/ }));
    fill({ ...validDoctor, Name: "  Dr. New  " });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add doctor" }));
    await waitFor(() => expect(api.createDoctor).toHaveBeenCalledWith({ name: "Dr. New", specialization: "Neurology", hospital: "Central", phone: "+1 555 010 2000", email: "new@example.com" }));
    expect(await screen.findByText("Dr. New was added.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(api.listDoctors).mock.calls.length).toBeGreaterThan(before));
  });

  it("disables duplicate submissions while saving", async () => {
    let resolve!: (value: api.Doctor) => void;
    vi.mocked(api.createDoctor).mockReturnValue(new Promise((done) => { resolve = done; }));
    await renderList();
    fireEvent.click(screen.getByRole("button", { name: /Add doctor/ }));
    fill(validDoctor);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Add doctor" }));
    const saving = await within(dialog).findByRole("button", { name: "Saving…" });
    expect(saving).toBeDisabled();
    fireEvent.click(saving);
    expect(api.createDoctor).toHaveBeenCalledTimes(1);
    await act(async () => resolve(doctor));
  });

  it("shows backend field validation errors inline", async () => {
    vi.mocked(api.createDoctor).mockRejectedValue(new api.ApiError("Validation failed", 400, [{ field: "email", message: "Email is already invalid on server" }]));
    await renderList();
    fireEvent.click(screen.getByRole("button", { name: /Add doctor/ }));
    fill(validDoctor);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add doctor" }));
    expect(await screen.findByText("Email is already invalid on server")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("edits a doctor with prefilled values", async () => {
    await renderList();
    fireEvent.click(screen.getAllByRole("button", { name: "Edit Dr. Ada" })[0]!);
    const dialog = screen.getByRole("dialog", { name: "Edit doctor" });
    expect(within(dialog).getByLabelText("Hospital", { exact: false })).toHaveValue("City Hospital");
    fireEvent.change(within(dialog).getByLabelText("Hospital", { exact: false }), { target: { value: "New Hospital" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updateDoctor).toHaveBeenCalledWith("d1", expect.objectContaining({ hospital: "New Hospital" })));
  });

  it("deletes only after confirmation", async () => {
    await renderList();
    fireEvent.click(screen.getAllByRole("button", { name: "Delete Dr. Ada" })[0]!);
    const dialog = screen.getByRole("dialog", { name: "Delete Dr. Ada?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(api.deleteDoctor).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Delete Dr. Ada" })[0]!);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete doctor" }));
    await waitFor(() => expect(api.deleteDoctor).toHaveBeenCalledWith("d1"));
    expect(await screen.findByText("Dr. Ada was deleted.")).toBeInTheDocument();
  });

  it("keeps the list visible and explains a delete conflict", async () => {
    vi.mocked(api.deleteDoctor).mockRejectedValue(new api.ApiError("This doctor has 2 associated patients. Remove them before deleting the doctor.", 409));
    await renderList();
    fireEvent.click(screen.getAllByRole("button", { name: "Delete Dr. Ada" })[0]!);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete doctor" }));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("2 associated patients");
    expect(screen.getAllByText("Dr. Ada").length).toBeGreaterThan(0);
  });

  it("closes dialogs with Escape", async () => {
    await renderList();
    fireEvent.click(screen.getByRole("button", { name: /Add doctor/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("DoctorDetails", () => {
  it("shows a loading state, then the doctor profile and patient count", async () => {
    vi.mocked(api.listDoctorPatients).mockResolvedValue(patientList([patient]));
    render(<DoctorDetails id="d1" />);
    expect(screen.getByRole("status", { name: "Loading doctor" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Dr. Ada" })).toBeInTheDocument();
    expect(screen.getByText("Cardiology")).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText(/1 patient assigned/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Patient One" })).toHaveAttribute("href", "/patients/p1");
    expect(screen.getByRole("link", { name: "View in Patients" })).toHaveAttribute("href", "/patients?doctorId=d1");
  });

  it("shows not found without a retry for a missing doctor", async () => {
    vi.mocked(api.getDoctor).mockRejectedValue(new api.ApiError("Doctor not found", 404));
    render(<DoctorDetails id="d1" />);
    expect(await screen.findByRole("heading", { name: "Doctor not found" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("retries after a load error", async () => {
    vi.mocked(api.getDoctor).mockRejectedValueOnce(new api.ApiError("Server unavailable", 500));
    render(<DoctorDetails id="d1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Server unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Dr. Ada" })).toBeInTheDocument();
  });

  it("validates, adds, and removes patients with confirmation", async () => {
    vi.mocked(api.listDoctorPatients).mockResolvedValueOnce(patientList([])).mockResolvedValueOnce(patientList([patient]));
    render(<DoctorDetails id="d1" />);
    expect(await screen.findByText("No patients assigned to this doctor.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add patient" }));
    fireEvent.click(screen.getByRole("button", { name: "Save patient" }));
    expect(screen.getByText("Name is required")).toBeInTheDocument();
    expect(api.addDoctorPatient).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Patient name"), { target: { value: "Patient One" } });
    fireEvent.change(screen.getByLabelText("Patient condition"), { target: { value: "Follow-up" } });
    fireEvent.click(screen.getByRole("button", { name: "Save patient" }));
    await waitFor(() => expect(api.addDoctorPatient).toHaveBeenCalledWith("d1", { name: "Patient One", condition: "Follow-up", phone: "", email: "" }));
    expect(await screen.findByText("Patient One")).toBeInTheDocument();
    expect(screen.getByText(/1 patient assigned/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove Patient One" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove patient" }));
    await waitFor(() => expect(api.deleteDoctorPatient).toHaveBeenCalledWith("d1", "p1"));
    expect(await screen.findByText("No patients assigned to this doctor.")).toBeInTheDocument();
    expect(screen.getByText("0 patients assigned")).toBeInTheDocument();
  });

  it("keeps the patient when removal fails and shows the error", async () => {
    vi.mocked(api.listDoctorPatients).mockResolvedValue(patientList([patient]));
    vi.mocked(api.deleteDoctorPatient).mockRejectedValue(new api.ApiError("Patient not found for this doctor", 404));
    render(<DoctorDetails id="d1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Patient One" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove patient" }));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("Patient not found for this doctor");
    expect(screen.getByText("Patient One")).toBeInTheDocument();
  });

  it("deletes the doctor and returns to the list", async () => {
    render(<DoctorDetails id="d1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete doctor" }));
    await waitFor(() => expect(api.deleteDoctor).toHaveBeenCalledWith("d1"));
    expect(routerReplace).toHaveBeenCalledWith("/doctors");
  });
});

describe("doctor API helpers", () => {
  it("builds query strings without empty values", () => {
    expect(api.buildDoctorQueryString({ page: 2, limit: 10, search: " ada ", specialization: "", sort: "name" })).toBe("page=2&limit=10&search=ada&sort=name");
  });

  it("mirrors backend validation rules", () => {
    expect(api.validateDoctorInput({ name: "A", specialization: "B", hospital: "C", phone: "+880 1700-000000", email: "a@b.co" })).toEqual({});
    expect(api.validatePatientInput({ name: "A", condition: "B", phone: "", email: "" })).toEqual({});
    expect(api.validatePatientInput({ name: "A", condition: "B", phone: "abc", email: "x" })).toMatchObject({ phone: expect.any(String), email: expect.any(String) });
  });
});
