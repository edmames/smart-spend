import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Vitest 4 runs without globals-based RTL auto-cleanup unless configured.
afterEach(() => {
  cleanup();
});

// jsdom implements <dialog> only partially: `showModal` is missing. Provide the
// minimal behaviour SmartSpend's ConfirmDialog relies on so the component can be
// tested in jsdom at all (real dialog semantics are covered by the Playwright run).
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.show = function show(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
}
