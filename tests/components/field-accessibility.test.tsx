import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field, TextInput } from "@/components/ui/forms";

/**
 * Regression tests for Phase 2L: Field component aria-describedby
 * association between form controls and their error/hint messages.
 */
describe("Field accessibility", () => {
  it("associates error message with input via aria-describedby", () => {
    render(
      <Field label="Nama dompet" error="Nama wajib diisi" htmlFor="wallet-name" optional={false}>
        <TextInput id="wallet-name" placeholder="Masukkan nama" />
      </Field>,
    );

    const input = screen.getByLabelText("Nama dompet");
    const error = screen.getByText("Nama wajib diisi");
    const describedBy = input.getAttribute("aria-describedby");

    // The input should reference the error's id
    expect(describedBy).toBeTruthy();
    const errorId = error.getAttribute("id");
    expect(describedBy).toContain(errorId);
    // Error message uses role="alert" for immediate screen reader announcement
    expect(error).toHaveAttribute("role", "alert");
  });

  it("does not set aria-describedby when there is no error", () => {
    render(
      <Field label="Nama dompet" htmlFor="wallet-name">
        <TextInput id="wallet-name" placeholder="Masukkan nama" />
      </Field>,
    );

    const input = screen.getByLabelText("Nama dompet");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("associates hint with input via aria-describedby when no error", () => {
    render(
      <Field
        label="Nama dompet"
        hint="Gunakan inisial bank"
        htmlFor="wallet-name"
      >
        <TextInput id="wallet-name" placeholder="Masukkan nama" />
      </Field>,
    );

    const input = screen.getByLabelText("Nama dompet");
    const hint = screen.getByText("Gunakan inisial bank");
    const describedBy = input.getAttribute("aria-describedby");

    expect(describedBy).toBeTruthy();
    expect(describedBy).toContain(hint.getAttribute("id"));
  });

  it("labels include the 'opsional' indicator for optional fields", () => {
    render(
      <Field label="Catatan" optional htmlFor="note">
        <TextInput id="note" placeholder="Opsional" />
      </Field>,
    );

    expect(screen.getByText("opsional")).toBeInTheDocument();
  });
});
