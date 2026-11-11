import { expect, type Page, test } from "@playwright/test";

const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;
const RUN = `E2E ${Date.now().toString(36)}`;
const DOCTOR_A = `Dr. [${RUN}] Alpha`;
const DOCTOR_B = `Dr. [${RUN}] Beta`;
const PATIENT = `[${RUN}] Patient`;

test.skip(!email || !password, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run the end-to-end workflow.");

/** Deletes every record tagged with this run (patients first, so doctor deletion is never blocked). */
async function cleanup(page: Page) {
  await page.evaluate(async (tag) => {
    const patients = await (await fetch(`/api/patients?limit=100&search=${encodeURIComponent(tag)}`)).json();
    for (const patient of patients.data ?? []) await fetch(`/api/patients/${patient._id}`, { method: "DELETE" });
    const doctors = await (await fetch(`/api/doctors?limit=100&search=${encodeURIComponent(tag)}`)).json();
    for (const doctor of doctors.data ?? []) await fetch(`/api/doctors/${doctor._id}`, { method: "DELETE" });
  }, RUN).catch(() => undefined);
}

/**
 * The page the user currently sees. Next.js keeps previously visited routes mounted but hidden
 * (React Activity), so page-level queries are scoped to the visible <main>.
 */
const view = (page: Page) => page.locator("main").filter({ visible: true }).first();

async function addDoctor(page: Page, name: string) {
  await page.getByRole("button", { name: /Add doctor/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add doctor" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("combobox", { name: /Specialization/ }).fill("Cardiology");
  await dialog.getByRole("combobox", { name: /Hospital/ }).fill("E2E Test Hospital");
  await dialog.getByLabel("Phone").fill("+1 555 0199 0000");
  await dialog.getByLabel("Email").fill("e2e.doctor@test.example");
  await dialog.getByRole("button", { name: "Add doctor" }).click();
  await expect(page.getByText(`${name} was added.`)).toBeVisible();
  await expect(dialog).toBeHidden();
}

test("admin workflow: login → doctors → patients → reassign → delete → logout", async ({ page }) => {
  try {
    // 1–2. Login through the real form
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
    await page.getByLabel("Email address").fill(email!);
    await page.getByLabel("Password").fill(password!);
    await page.getByRole("button", { name: "Sign in securely" }).click();

    // 3. Dashboard with live statistics
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(view(page).getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await expect(view(page).getByRole("heading", { name: "Total doctors" })).toBeVisible();

    // 4. Create two disposable doctors
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Doctors" }).click();
    await expect(view(page).getByRole("heading", { level: 1, name: "Doctors" })).toBeVisible();
    await addDoctor(page, DOCTOR_A);
    await addDoctor(page, DOCTOR_B);

    // 5. Search for the doctor
    await view(page).getByLabel("Search doctors").fill(DOCTOR_A);
    const doctorLink = view(page).getByRole("link", { name: DOCTOR_A }).first();
    await expect(doctorLink).toBeVisible();
    await expect(view(page).getByRole("link", { name: DOCTOR_B })).toHaveCount(0);

    // 6–7. Doctor details, add a patient there
    await doctorLink.click();
    await expect(view(page).getByRole("heading", { level: 1, name: DOCTOR_A })).toBeVisible();
    await view(page).getByRole("button", { name: "Add patient" }).click();
    // exact: Next keeps visited routes mounted but hidden (React Activity), e.g. the dashboard's
    // "Patient conditions" card, so labels are matched exactly.
    await view(page).getByLabel("Patient name", { exact: true }).fill(PATIENT);
    await view(page).getByLabel("Patient condition", { exact: true }).fill("E2E verification");
    await view(page).getByRole("button", { name: "Save patient" }).click();
    await expect(view(page).getByRole("link", { name: PATIENT })).toBeVisible();
    await expect(view(page).getByText(/1 patient assigned/)).toBeVisible();

    // 8–9. Patients page search
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Patients" }).click();
    await view(page).getByLabel("Search patients").fill(RUN);
    await expect(view(page).getByRole("link", { name: PATIENT }).first()).toBeVisible();

    // 10–12. Edit and reassign to the second doctor
    await view(page).getByRole("button", { name: `Edit ${PATIENT}` }).first().click();
    const dialog = page.getByRole("dialog", { name: "Edit patient" });
    await dialog.getByRole("combobox", { name: /Condition/ }).fill("E2E edited condition");
    await dialog.getByRole("button", { name: /^Assigned doctor:/ }).click();
    await page.getByRole("combobox", { name: "Assigned doctor search" }).fill(RUN + "] Beta");
    await page.getByRole("option", { name: new RegExp(`Beta`) }).click();
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(`${PATIENT} was reassigned and updated.`)).toBeVisible();
    await expect(view(page).getByRole("link", { name: DOCTOR_B }).first()).toBeVisible();

    await view(page).getByRole("link", { name: PATIENT }).first().click();
    await expect(view(page).getByRole("heading", { level: 1, name: PATIENT })).toBeVisible();
    await expect(view(page).getByText("E2E edited condition").first()).toBeVisible();
    await view(page).getByRole("link", { name: new RegExp(`${RUN.replace(/[[\]]/g, "\\$&")}\\] Beta`) }).click();
    await expect(view(page).getByRole("heading", { level: 1, name: DOCTOR_B })).toBeVisible();
    await expect(view(page).getByRole("link", { name: PATIENT })).toBeVisible(); // relationship moved to Beta

    // 13. Delete the patient (with confirmation)
    await view(page).getByRole("button", { name: `Remove ${PATIENT}` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove patient" }).click();
    await expect(view(page).getByText("No patients assigned to this doctor.")).toBeVisible();

    // 14. Delete both doctors from their details pages
    for (const name of [DOCTOR_B, DOCTOR_A]) {
      await page.goto("/doctors");
      await view(page).getByLabel("Search doctors").fill(name);
      await view(page).getByRole("link", { name }).first().click();
      await expect(view(page).getByRole("heading", { level: 1, name })).toBeVisible();
      await view(page).getByRole("button", { name: "Delete", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Delete doctor" }).click();
      await expect(page).toHaveURL(/\/doctors$/);
    }
    await view(page).getByLabel("Search doctors").fill(RUN);
    await expect(view(page).getByText("No doctors match your filters")).toBeVisible();

    // 15. Log out
    await page.getByRole("button", { name: "Sign out" }).first().click();
    await expect(page).toHaveURL(/\/login/);

    // 16. Protected pages and APIs are no longer accessible
    for (const path of ["/dashboard", "/doctors", "/patients"]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}`));
    }
    expect((await page.request.get("/api/doctors")).status()).toBe(401);
  } finally {
    // Safety net: if any step failed while signed in, remove this run's records.
    await cleanup(page);
  }
});
