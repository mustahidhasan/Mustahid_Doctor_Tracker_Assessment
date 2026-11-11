import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SelectMenu, type SelectOption } from "./SelectMenu";

const options: SelectOption[] = [
  { value: "", label: "All hospitals" },
  { value: "riverside", label: "Riverside General Hospital" },
  { value: "northgate", label: "Northgate Medical Center" },
  { value: "lakeview", label: "Lakeview Community Hospital" },
];

function Harness({ searchable = false, onChange = vi.fn() }: { searchable?: boolean; onChange?: (value: string) => void }) {
  const [value, setValue] = useState("");
  return <>
    <SelectMenu label="Filter hospital" value={value} options={options} searchable={searchable} onChange={(next) => { setValue(next); onChange(next); }} />
    <button type="button">Outside</button>
  </>;
}

afterEach(cleanup);

describe("SelectMenu", () => {
  it("shows the selected label and opens a styled listbox on click", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: /^Filter hospital:/ });
    expect(trigger).toHaveTextContent("All hospitals");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("option")).toHaveLength(4);
    expect(screen.getByRole("option", { name: "All hospitals" })).toHaveAttribute("aria-selected", "true");
  });

  it("selects an option with the mouse and closes", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /^Filter hospital:/ }));
    fireEvent.click(screen.getByRole("option", { name: "Northgate Medical Center" }));
    expect(onChange).toHaveBeenCalledWith("northgate");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Filter hospital:/ })).toHaveTextContent("Northgate Medical Center");
  });

  it("supports keyboard navigation and selection", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: /^Filter hospital:/ });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const listbox = screen.getByRole("listbox");
    expect(listbox).toHaveFocus();
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    fireEvent.keyDown(listbox, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("northgate");
    expect(trigger).toHaveFocus();
  });

  it("jumps to options by typed letter when not searchable", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /^Filter hospital:/ }));
    const listbox = screen.getByRole("listbox");
    fireEvent.keyDown(listbox, { key: "l" });
    fireEvent.keyDown(listbox, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("lakeview");
  });

  it("filters options by search text and shows a no-match message", () => {
    const onChange = vi.fn();
    render(<Harness searchable onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /^Filter hospital:/ }));
    const search = screen.getByRole("combobox", { name: "Filter hospital search" });
    expect(search).toHaveFocus();
    fireEvent.change(search, { target: { value: "lake" } });
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Lakeview Community Hospital"]);
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("lakeview");
    fireEvent.click(screen.getByRole("button", { name: /^Filter hospital:/ }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zzz" } });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText(/No matches/)).toBeInTheDocument();
  });

  it("closes on Escape and on outside click without changing the value", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: /^Filter hospital:/ });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.click(trigger);
    fireEvent.mouseDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
