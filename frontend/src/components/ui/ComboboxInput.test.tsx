import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComboboxInput } from "./ComboboxInput";
import { Modal } from "./Modal";

const OPTIONS = ["Cardiology", "Dermatology", "Endocrinology", "Neurology", "Pediatrics"];

function Harness({ onChange = vi.fn(), options = OPTIONS }: { onChange?: (value: string) => void; options?: string[] }) {
  const [value, setValue] = useState("");
  return <>
    <label htmlFor="spec">Specialization</label>
    <ComboboxInput id="spec" value={value} options={options} onChange={(next) => { setValue(next); onChange(next); }} />
    <button type="button">Outside</button>
  </>;
}
afterEach(cleanup);

describe("ComboboxInput", () => {
  it("is a labelled combobox whose custom list opens on focus", () => {
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Specialization" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    fireEvent.focus(input);
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(within(screen.getByRole("listbox")).getAllByRole("option")).toHaveLength(5);
    expect(document.querySelector("datalist")).toBeNull(); // no native browser dropdown
  });

  it("filters suggestions as you type and still accepts new values", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByRole("combobox", { name: "Specialization" });
    fireEvent.change(input, { target: { value: "olog" } });
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Cardiology", "Dermatology", "Endocrinology", "Neurology"]);
    fireEvent.change(input, { target: { value: "Sports Medicine" } });
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(input).toHaveValue("Sports Medicine");
    expect(onChange).toHaveBeenLastCalledWith("Sports Medicine");
  });

  it("picks a suggestion with the mouse", () => {
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Specialization" });
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("option", { name: "Neurology" }));
    expect(input).toHaveValue("Neurology");
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("supports arrow keys and Enter with aria-activedescendant", () => {
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Specialization" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const active = input.getAttribute("aria-activedescendant")!;
    expect(document.getElementById(active)).toHaveTextContent("Dermatology");
    expect(document.getElementById(active)).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue("Dermatology");
  });

  it("closes on Escape and on an outside click", () => {
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Specialization" });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(input);
    expect(input).toHaveAttribute("aria-expanded", "true");
    fireEvent.mouseDown(screen.getByRole("button", { name: "Outside" }));
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("inside a dialog, Escape closes only the suggestion list", () => {
    const onClose = vi.fn();
    render(<Modal title="Add doctor" onClose={onClose}><Harness /></Modal>);
    const input = screen.getByRole("combobox", { name: "Specialization" });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Escape" }); // second Escape (list closed) closes the dialog
    expect(onClose).toHaveBeenCalled();
  });

  it("has no detectable accessibility violations while open", async () => {
    render(<main><Harness /></main>);
    fireEvent.focus(screen.getByRole("combobox", { name: "Specialization" }));
    const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
