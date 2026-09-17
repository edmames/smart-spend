"use client";

import { useMemo, useState } from "react";
import { Archive, FolderKanban, Plus, RotateCcw } from "lucide-react";
import { useSmartSpendStore } from "@/app/store";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { Badge, Button, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui/layout";
import { Segmented } from "@/components/ui/forms";
import { CATEGORY_ICON_OPTIONS, getCategoryIconById, type CategoryType } from "@/domain/categories";
import type { Category } from "@/domain/models";
import { cn } from "@/lib/cn";

type Mode = "create" | "edit";
const TYPE_LABEL: Record<CategoryType, string> = { expense: "Pengeluaran", income: "Pemasukan" };

export default function CategoriesPage() {
  const categories = useSmartSpendStore((state) => state.data.categories);
  const [type, setType] = useState<CategoryType>("expense");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);

  const scoped = useMemo(() => categories.filter((category) => category.type === type), [categories, type]);
  const active = scoped.filter((category) => category.archivedAt == null);
  const archived = scoped.filter((category) => category.archivedAt != null);

  const closeForm = () => {
    setEditing(null);
    setCreating(false);
  };

  return (
    <>
      <PageHeader
        title="Kategori"
        subtitle="Kelola kategori transaksi. Arsip tidak mengubah riwayat, budget, atau laporan lama."
        backHref="/more"
        actions={
          <Button size="sm" onClick={() => { setCreating(true); setEditing(null); }}>
            <Plus className="h-4 w-4" aria-hidden />
            Tambah
          </Button>
        }
      />

      <HydrationGate>
        <div className="flex flex-col gap-3">
          <Card as="section" className="flex flex-col gap-3">
            <Segmented<CategoryType>
              label="Jenis kategori"
              value={type}
              columns={2}
              options={[
                { value: "expense", label: "Pengeluaran" },
                { value: "income", label: "Pemasukan" },
              ]}
              onChange={(next) => { setType(next); closeForm(); }}
            />
            <p className="text-[12.5px] leading-relaxed text-muted">
              Kategori {TYPE_LABEL[type].toLowerCase()} aktif tersedia untuk transaksi baru. Kategori arsip tetap dipakai untuk membaca riwayat.
            </p>
          </Card>

          {creating ? <CategoryForm mode="create" type={type} onDone={closeForm} /> : null}
          {editing ? <CategoryForm mode="edit" category={editing} onDone={closeForm} /> : null}

          <SectionTitle
            action={
              archived.length > 0 ? (
                <Button size="sm" variant="ghost" onClick={() => setShowArchived((value) => !value)}>
                  {showArchived ? "Sembunyikan arsip" : `Tampilkan arsip (${archived.length})`}
                </Button>
              ) : null
            }
          >
            {TYPE_LABEL[type]} aktif
          </SectionTitle>

          {active.length === 0 ? (
            <EmptyState
              icon={<FolderKanban className="h-7 w-7" aria-hidden />}
              title={`Belum ada kategori ${TYPE_LABEL[type].toLowerCase()} aktif`}
              description="Buat kategori baru atau pulihkan kategori yang diarsipkan."
              action={<Button onClick={() => setCreating(true)}>Tambah kategori</Button>}
            />
          ) : (
            <CategoryList categories={active} onEdit={(category) => { setEditing(category); setCreating(false); }} />
          )}

          {showArchived && archived.length > 0 ? (
            <>
              <SectionTitle>Diarsipkan</SectionTitle>
              <CategoryList categories={archived} archived onEdit={(category) => { setEditing(category); setCreating(false); }} />
              <p className="px-1 text-[11.5px] leading-relaxed text-muted">
                Kategori terarsip tidak muncul di pilihan transaksi baru, tapi seluruh riwayatnya tetap tercatat.
              </p>
            </>
          ) : null}
        </div>
      </HydrationGate>
    </>
  );
}

function CategoryList({ categories, archived = false, onEdit }: { categories: Category[]; archived?: boolean; onEdit: (category: Category) => void }) {
  const archiveCategory = useSmartSpendStore((state) => state.archiveCategory);
  const restoreCategory = useSmartSpendStore((state) => state.restoreCategory);

  return (
    <Card as="section" padded={false} className="divide-y divide-line/70 px-3">
      {categories.map((category) => {
        const Icon = getCategoryIconById(category.icon);
        const isArchived = category.archivedAt != null;
        return (
          <div key={category.id} className="flex items-center gap-3 py-2.5">
            <span className={cn(
              "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
              isArchived && "opacity-60",
            )}>
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[14px] font-bold text-ink">{category.label}</span>
                {isArchived ? <Badge tone="neutral">arsip</Badge> : null}
              </span>
              <span className="text-[11.5px] text-muted">{TYPE_LABEL[category.type]}</span>
            </span>
            {archived ? (
              <Button
                size="sm"
                variant="soft"
                onClick={() => void restoreCategory(category.id)}
                aria-label={`Pulihkan kategori ${category.label}`}
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
              </Button>
            ) : (
              <>
                <Button size="sm" variant="secondary" onClick={() => onEdit(category)} aria-label={`Ubah kategori ${category.label}`}>
                  Ubah
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void archiveCategory(category.id)}
                  aria-label={`Arsipkan kategori ${category.label}`}
                >
                  <Archive className="h-4 w-4" aria-hidden />
                </Button>
              </>
            )}
          </div>
        );
      })}
    </Card>
  );
}

function CategoryForm({ mode, type, category, onDone }: { mode: Mode; type?: CategoryType; category?: Category; onDone: () => void }) {
  const createCategory = useSmartSpendStore((state) => state.createCategory);
  const updateCategory = useSmartSpendStore((state) => state.updateCategory);
  const [label, setLabel] = useState(category?.label ?? "");
  const [icon, setIcon] = useState(category?.icon ?? CATEGORY_ICON_OPTIONS[0]?.id ?? "dots");
  const [error, setError] = useState<string | null>(null);

  const targetType = type ?? category?.type ?? "expense";

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const result = mode === "create"
      ? createCategory({ label, type: targetType, icon })
      : updateCategory(category?.id as string, { label, icon });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onDone();
  };

  return (
    <Card as="section" className="flex flex-col gap-3">
      <div>
        <h2 className="text-[14px] font-bold text-ink">{mode === "create" ? "Tambah kategori" : "Ubah kategori"}</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">Jenis {TYPE_LABEL[targetType].toLowerCase()} tidak dapat diubah setelah kategori dibuat.</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        {error ? <p role="alert" className="rounded-lg bg-warning-soft/50 px-3 py-2 text-[12.5px] font-semibold text-warning">{error}</p> : null}
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Nama kategori
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={40}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[15px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="cth: Kopi, Freelance"
          />
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-ink">Icon</legend>
          <div className="grid grid-cols-4 gap-2">
            {CATEGORY_ICON_OPTIONS.map((option) => {
              const IconComponent = getCategoryIconById(option.id);
              const selected = icon === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setIcon(option.id)}
                  aria-label={`Pilih icon ${option.label}`}
                  aria-pressed={selected}
                  className={cn(
                    "flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-[10.5px] font-semibold transition",
                    selected ? "border-brand bg-brand text-primary-foreground" : "border-line bg-surface text-muted hover:border-brand/50 hover:text-ink",
                  )}
                >
                  <IconComponent className="h-4 w-4" aria-hidden />
                  <span className="max-w-full truncate">{option.label}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button variant="secondary" onClick={onDone}>Batal</Button>
          <Button type="submit">{mode === "create" ? "Simpan kategori" : "Simpan perubahan"}</Button>
        </div>
      </form>
    </Card>
  );
}
