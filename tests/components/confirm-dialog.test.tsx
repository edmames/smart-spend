import { describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * Regression tests for Phase 2L: ConfirmDialog focus management,
 * aria-labelledby / aria-describedby association, and safe cancellation.
 */
describe("ConfirmDialog accessibility", () => {
  it("has aria-labelledby and aria-describedby linking title and description", () => {
    render(
      <ConfirmDialog
        open={true}
        title="Hapus dompet?"
        description="Dompet BCA akan dihapus permanen."
        confirmLabel="Hapus"
        cancelLabel="Batal"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-labelledby", "confirm-dialog-title");
    expect(dialog).toHaveAttribute("aria-describedby", "confirm-dialog-desc");
    expect(screen.getByText("Hapus dompet?")).toHaveAttribute("id", "confirm-dialog-title");
    expect(screen.getByText("Dompet BCA akan dihapus permanen.")).toHaveAttribute("id", "confirm-dialog-desc");
  });

  it("does not set aria-describedby when no description is provided", () => {
    render(
      <ConfirmDialog
        open={true}
        title="Apakah kamu yakin?"
        confirmLabel="Ya"
        cancelLabel="Batal"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).not.toHaveAttribute("aria-describedby");
  });

  it("focuses the cancel button when opened without requirePhrase", async () => {
    render(
      <ConfirmDialog
        open={true}
        title="Hapus?"
        confirmLabel="Hapus"
        cancelLabel="Batal"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const cancelButton = screen.getByRole("button", { name: "Batal" });
    expect(cancelButton).toHaveFocus();
  });

  it("focuses the phrase input when opened with requirePhrase", () => {
    render(
      <ConfirmDialog
        open={true}
        title="Hapus?"
        description="Ketik hapus untuk mengonfirmasi."
        requirePhrase="hapus"
        confirmLabel="Hapus"
        cancelLabel="Batal"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const phraseInput = screen.getByLabelText(/Ketik/i);
    expect(phraseInput).toHaveFocus();
  });

  it("does not confirm when phrase is wrong, and does not call onConfirm", async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <ConfirmDialog
        open={true}
        title="Hapus transaksi?"
        description="Ketik hapus untuk mengonfirmasi."
        requirePhrase="hapus"
        confirmLabel="Hapus"
        cancelLabel="Batal"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    await user.type(screen.getByLabelText(/Ketik/i), "salah");
    const confirmButton = screen.getByRole("button", { name: "Hapus" });
    expect(confirmButton).toBeDisabled();

    await act(async () => {
      await user.click(confirmButton);
    });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("confirms and closes when phrase matches", async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <ConfirmDialog
        open={true}
        title="Hapus dompet?"
        description="Ketik hapus untuk mengonfirmasi."
        requirePhrase="hapus"
        confirmLabel="Hapus"
        cancelLabel="Batal"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    await user.type(screen.getByLabelText(/Ketik/i), "hapus");
    const confirmButton = screen.getByRole("button", { name: "Hapus" });
    expect(confirmButton).toBeEnabled();

    await act(async () => {
      await user.click(confirmButton);
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("has a non-danger default cancel button (safe cancellation)", () => {
    render(
      <ConfirmDialog
        open={true}
        title="Hapus?"
        confirmLabel="Hapus"
        cancelLabel="Batal"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const confirmButton = screen.getByRole("button", { name: "Hapus" });
    expect(confirmButton).toHaveAttribute("type", "submit");
    expect(confirmButton).not.toBeDisabled();
  });
});
