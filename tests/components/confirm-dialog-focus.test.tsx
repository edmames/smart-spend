import { describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * Regression tests for Phase 2L: ConfirmDialog focus management.
 *
 * jsdom doesn't fully implement <dialog>.showModal(), so we test the
 * logical behavior: focus moves to the dialog, focus is restored on close,
 * and the phrase gate works correctly.
 */
describe("ConfirmDialog focus management", () => {
  it("restores focus to trigger element when dialog closes", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open dialog</button>
          <ConfirmDialog
            open={open}
            title="Hapus dompet?"
            description="Dompet akan dihapus."
            confirmLabel="Hapus"
            cancelLabel="Batal"
            onConfirm={vi.fn()}
            onClose={() => setOpen(false)}
          />
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open dialog" });
    await user.click(trigger);

    // The cancel button should receive focus when the dialog opens
    const cancelButton = screen.getByRole("button", { name: "Batal" });
    expect(cancelButton).toHaveFocus();

    // Close via Cancel
    await user.click(cancelButton);

    // Focus should be restored to the trigger
    expect(trigger).toHaveFocus();
  });

  it("cancel button closes without confirming", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          <ConfirmDialog
            open={open}
            title="Hapus?"
            confirmLabel="Hapus"
            cancelLabel="Batal"
            onConfirm={onConfirm}
            onClose={() => setOpen(false)}
          />
        </>
      );
    }

    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(screen.getByRole("button", { name: "Batal" }));

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("requirePhrase gates confirm until exact match", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        title="Hapus transaksi?"
        description="Ketik hapus untuk mengonfirmasi."
        requirePhrase="hapus"
        confirmLabel="Hapus"
        cancelLabel="Batal"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );

    const confirmButton = screen.getByRole("button", { name: "Hapus" });
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText(/Ketik/i), "salah");
    expect(confirmButton).toBeDisabled();

    await user.clear(screen.getByLabelText(/Ketik/i));
    await user.type(screen.getByLabelText(/Ketik/i), "hapus");
    expect(confirmButton).toBeEnabled();
  });

  it("reopening the dialog focuses the cancel button again", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          <ConfirmDialog
            open={open}
            title="Hapus?"
            confirmLabel="Hapus"
            cancelLabel="Batal"
            onConfirm={vi.fn()}
            onClose={() => setOpen(false)}
          />
        </>
      );
    }

    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("button", { name: "Batal" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Batal" }));

    // Reopen
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("button", { name: "Batal" })).toHaveFocus();
  });

  it("does not throw when trigger element is removed before restoration", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(false);
      const [removed, setRemoved] = useState(false);
      return (
        <>
          {!removed ? (
            <button id="trigger" onClick={() => setOpen(true)}>
              Open
            </button>
          ) : null}
          <ConfirmDialog
            open={open}
            title="Hapus?"
            confirmLabel="Hapus"
            cancelLabel="Batal"
            onConfirm={vi.fn()}
            onClose={() => {
              setOpen(false);
              setRemoved(true);
            }}
          />
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open" });
    await user.click(trigger);

    // Close and simultaneously remove the trigger
    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Batal" }));
    });

    // The trigger should have been removed from the DOM
    expect(document.getElementById("trigger")).toBeNull();
    // Closing should not throw even though the trigger is gone
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
