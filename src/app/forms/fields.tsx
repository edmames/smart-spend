"use client";

import { useController, type Control, type FieldValues, type Path } from "react-hook-form";
import { AmountInput, CalendarDateInput, Field, Select, TextArea, TextInput, type SelectOption } from "@/components/ui/forms";
import { PAYMENT_METHOD_OPTIONS } from "@/app/hooks";

/**
 * Shared form controls.
 *
 * These wrap `useController` so the label / control / error triple is never
 * re-implemented per screen — every form gets identical accessibility and every
 * error message comes from the same Zod schema that guards the mutation.
 */

export function FormText<T extends FieldValues>({
  label,
  control,
  name,
  placeholder,
  hint,
  optional,
  type = "text",
  autoComplete = "off",
  inputMode,
}: {
  label: string;
  control: Control<T>;
  name: Path<T>;
  placeholder?: string;
  hint?: string;
  optional?: boolean;
  type?: "text" | "date";
  autoComplete?: string;
  inputMode?: "numeric" | "text";
}) {
  const { field, fieldState } = useController({ control, name });
  return (
    <Field label={label} error={fieldState.error?.message} htmlFor={`${String(name)}-input`} optional={optional} hint={hint}>
      <TextInput
        id={`${String(name)}-input`}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={fieldState.invalid}
        value={typeof field.value === "string" ? field.value : ""}
        onChange={field.onChange}
        onBlur={field.onBlur}
        name={field.name}
        inputRef={field.ref}
      />
    </Field>
  );
}

export function FormSelect<T extends FieldValues>({
  label,
  control,
  name,
  options,
  placeholder = "Pilih…",
  hint,
  optional,
}: {
  label: string;
  control: Control<T>;
  name: Path<T>;
  options: SelectOption[];
  placeholder?: string;
  hint?: string;
  optional?: boolean;
}) {
  const { field, fieldState } = useController({ control, name });
  return (
    <Field label={label} error={fieldState.error?.message} htmlFor={`${String(name)}-select`} optional={optional} hint={hint}>
      <Select
        id={`${String(name)}-select`}
        aria-invalid={fieldState.invalid}
        options={options}
        placeholder={placeholder}
        value={typeof field.value === "string" ? field.value : ""}
        onChange={(event) => field.onChange(event.target.value)}
        onBlur={field.onBlur}
        name={field.name}
        inputRef={field.ref}
      />
    </Field>
  );
}

export function FormNote<T extends FieldValues>({
  label = "Catatan",
  control,
  name = "note" as Path<T>,
  optional = true,
  placeholder = "cth: makan siang dengan tim",
  maxLength = 280,
}: {
  label?: string;
  control: Control<T>;
  name?: Path<T>;
  optional?: boolean;
  placeholder?: string;
  maxLength?: number;
}) {
  const { field, fieldState } = useController({ control, name });
  return (
    <Field label={label} error={fieldState.error?.message} htmlFor={`${String(name)}-area`} optional={optional}>
      <TextArea
        id={`${String(name)}-area`}
        placeholder={placeholder}
        maxLength={maxLength}
        value={typeof field.value === "string" ? field.value : ""}
        onChange={field.onChange}
        onBlur={field.onBlur}
        name={field.name}
        inputRef={field.ref}
      />
    </Field>
  );
}

export function FormAmount<T extends FieldValues>({
  control,
  name,
  label = "Nominal",
  hint,
  optional,
}: {
  control: Control<T>;
  name: Path<T>;
  label?: string;
  hint?: string;
  optional?: boolean;
}) {
  const { fieldState } = useController({ control, name });
  return (
    <Field label={label} error={fieldState.error?.message} htmlFor={`${String(name)}-amount`} optional={optional} hint={hint}>
      <AmountInput control={control} name={name} id={`${String(name)}-amount`} />
    </Field>
  );
}

export function FormDate<T extends FieldValues>({ control, name }: { control: Control<T>; name: Path<T> }) {
  const { fieldState } = useController({ control, name });
  return (
    <Field label="Tanggal" error={fieldState.error?.message}>
      <CalendarDateInput control={control} name={name} />
    </Field>
  );
}

/**
 * Payment method is metadata on the transaction (never an account), so it lives on
 * the income/expense forms only. A transfer has no payment method.
 */
export function FormPaymentMethod<T extends FieldValues>({ control, name = "paymentMethod" as Path<T> }: { control: Control<T>; name?: Path<T> }) {
  const { field } = useController({ control, name });
  const value = typeof field.value === "string" ? field.value : "";
  return (
    <Field
      label="Metode pembayaran"
      optional
      htmlFor={`${String(name)}-pm`}
      hint="Sekadar pencatatan — QRIS, Debit, dan Transfer Bank tidak pernah punya saldo sendiri."
    >
      <Select
        id={`${String(name)}-pm`}
        options={PAYMENT_METHOD_OPTIONS}
        placeholder="Tidak spesifik"
        value={value}
        onChange={(event) => field.onChange(event.target.value === "" ? null : event.target.value)}
        onBlur={field.onBlur}
        name={field.name}
        inputRef={field.ref}
      />
    </Field>
  );
}
