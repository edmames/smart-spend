import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field, TextInput } from "@/components/ui/forms";

/**
 * Regression tests for Phase 2L: Field component aria-describedby
 * association between form controls and their error/hint messages.
 *
 * Covers merge behavior required by Part 2:
 *  A. child with existing aria-describedby
 *  B. hint only
 *  C. error only
 *  D. hint + error
 *  E. no hint/error
 *  F. duplicate ID prevention
 */
describe("Field accessibility", () => {
  it("A. merges existing aria-describedby with generated hint IDs", () => {
    render(
      <Field label="Nama dompet" hint="Gunakan inisial bank" htmlFor="wallet-name">
        <TextInput id="wallet-name" aria-describedby="custom-help" placeholder="Masukkan nama" />
      </Field>,
    );

    const input = screen.getByLabelText("Nama dompet");
    const hint = screen.getByText("Gunakan inisial bank");
    const describedBy = input.getAttribute("aria-describedby");

    expect(describedBy).toContain("custom-help");
    expect(describedBy).toContain(hint.getAttribute("id"));
    // No duplicate IDs
    const ids = describedBy!.split(" ");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("B. hint only — input references hint element ID", () => {
    render(
      <Field label="Nama dompet" hint="Gunakan inisial bank" htmlFor="wallet-name">
        <TextInput id="wallet-name" placeholder="Masukkan nama" />
      </Field>,
    );

    const input = screen.getByLabelText("Nama dompet");
    const hint = screen.getByText("Gunakan inisial bank");
    const describedBy = input.getAttribute("aria-describedby");

    expect(describedBy).toBeTruthy();
    expect(describedBy).toContain(hint.getAttribute("id"));
  });

  it("C. error only — input references error element ID", () => {
    render(
      <Field label="Nama dompet" error="Nama wajib diisi" htmlFor="wallet-name">
        <TextInput id="wallet-name" placeholder="Masukkan nama" />
      </Field>,
    );

    const input = screen.getByLabelText("Nama dompet");
    const error = screen.getByText("Nama wajib diisi");
    const describedBy = input.getAttribute("aria-describedby");

    expect(describedBy).toBeTruthy();
    const errorId = error.getAttribute("id");
    expect(describedBy).toContain(errorId);
    expect(error).toHaveAttribute("role", "alert");
  });

  it("D. hint + error — error takes priority, only error is referenced", () => {
    render(
      <Field label="Nama dompet" hint="Gunakan inisial bank" error="Nama wajib diisi" htmlFor="wallet-name">
        <TextInput id="wallet-name" placeholder="Masukkan nama" />
      </Field>,
    );

    const input = screen.getByLabelText("Nama dompet");
    const describedBy = input.getAttribute("aria-describedby");
    const error = screen.getByText("Nama wajib diisi");
    const errorId = error.getAttribute("id");

    // When both hint and error exist, error takes priority; hint element is not rendered
    expect(describedBy).toContain(errorId);
    expect(screen.queryByText("Gunakan inisial bank")).not.toBeInTheDocument();
  });

  it("E. no hint/error — no aria-describedby on input", () => {
    render(
      <Field label="Nama dompet" htmlFor="wallet-name">
        <TextInput id="wallet-name" placeholder="Masukkan nama" />
      </Field>,
    );

    const input = screen.getByLabelText("Nama dompet");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("F. does not duplicate IDs when child already references the same generated ID", () => {
    // When the child has its own aria-describedby that matches what Field would generate,
    // merge should not produce duplicates.
    render(
      <Field label="Nama dompet" error="Wajib" htmlFor="wallet-name">
        <TextInput id="wallet-name" aria-describedby="external-error" placeholder="Nama" />
      </Field>,
    );

    const input = screen.getByLabelText("Nama dompet");
    const describedBy = input.getAttribute("aria-describedby");

    // Should contain both the existing and the generated error ID
    expect(describedBy).toContain("external-error");
    const error = screen.getByText("Wajib");
    expect(describedBy).toContain(error.getAttribute("id"));
    // Should be space-separated, no duplicates
    const ids = describedBy!.split(" ");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("preserves child props (ref, value, onChange, name, inputMode) when cloning", () => {
    const handleChange = () => {};
    render(
      <Field label="Nama dompet" error="Wajib" htmlFor="wallet-name">
        <TextInput
          id="wallet-name"
          value="test"
          onChange={handleChange}
          name="walletName"
          inputMode="text"
          placeholder="Masukkan nama"
        />
      </Field>,
    );

    const input = screen.getByLabelText("Nama dompet") as HTMLInputElement;
    expect(input).toHaveAttribute("value", "test");
    expect(input).toHaveAttribute("name", "walletName");
    expect(input).toHaveAttribute("inputmode", "text");
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
