import { createEffect, createSignal, Index, on, Show } from "solid-js";
import { Plus, Trash2 } from "lucide-solid";
import { POLYGON_MAX_POINTS, type PolygonRow, type PolygonRowsValidation } from "~/lib/shared/polygon";

type Field = "lat" | "lng";

const BASE_INPUT_CLASS =
  "h-11 w-full min-w-0 rounded-lg border px-3 text-base text-slate-800 outline-none transition disabled:bg-slate-50 disabled:text-slate-500 sm:text-sm";

function fieldClass(hasError: boolean) {
  return `${BASE_INPUT_CLASS} ${
    hasError
      ? "border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
      : "border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
  }`;
}

export function PolygonPointEditor(props: {
  rows: PolygonRow[];
  validation: PolygonRowsValidation;
  showErrors: boolean;
  disabled?: boolean;
  /** Changing this key resets per-field touched state, e.g. when the block changes. */
  resetKey?: string;
  onChange: (rows: PolygonRow[]) => void;
}) {
  const [touched, setTouched] = createSignal<Record<string, boolean>>({});

  createEffect(
    on(
      () => props.resetKey,
      () => setTouched({}),
      { defer: true },
    ),
  );

  const markTouched = (rowId: string, field: Field) => {
    setTouched((current) => ({ ...current, [`${rowId}:${field}`]: true }));
  };

  const isTouched = (rowId: string, field: Field) => Boolean(touched()[`${rowId}:${field}`]);

  const fieldError = (row: PolygonRow, field: Field) => {
    if (!props.showErrors && !isTouched(row.id, field)) return "";
    return props.validation.errors[row.id]?.[field] ?? "";
  };

  const rowError = (row: PolygonRow) => {
    if (!props.showErrors && !isTouched(row.id, "lat") && !isTouched(row.id, "lng")) return "";
    return props.validation.errors[row.id]?.row ?? "";
  };

  const formError = () => {
    const error = props.validation.formError;
    if (!error) return "";
    if (props.showErrors) return error;
    const hasVisibleError = props.rows.some((row) => {
      if (!props.validation.errors[row.id]) return false;
      return isTouched(row.id, "lat") || isTouched(row.id, "lng");
    });
    return hasVisibleError ? error : "";
  };

  const describedBy = (row: PolygonRow, field: Field) => {
    const ids: string[] = [];
    if (fieldError(row, field)) ids.push(`${row.id}-${field}-error`);
    if (rowError(row)) ids.push(`${row.id}-row-error`);
    return ids.length > 0 ? ids.join(" ") : undefined;
  };

  const updateField = (rowId: string, field: Field, value: string) => {
    props.onChange(props.rows.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)));
  };

  const nextRowId = () => {
    const used = new Set(props.rows.map((row) => row.id));
    let index = props.rows.length;
    while (used.has(`p${index}`)) index += 1;
    return `p${index}`;
  };

  const addRow = () => {
    if (props.disabled || props.rows.length >= POLYGON_MAX_POINTS) return;
    props.onChange([...props.rows, { id: nextRowId(), lat: "", lng: "" }]);
  };

  const removeRow = (rowId: string) => {
    if (props.disabled || props.rows.length <= 1) return;
    setTouched((current) => {
      const next = { ...current };
      delete next[`${rowId}:lat`];
      delete next[`${rowId}:lng`];
      return next;
    });
    props.onChange(props.rows.filter((row) => row.id !== rowId));
  };

  return (
    <div class="flex flex-col gap-3">
      <div
        class="hidden grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_2.75rem] gap-3 text-xs font-medium text-slate-500 sm:grid"
        aria-hidden="true"
      >
        <span>No</span>
        <span>Latitude (Y)</span>
        <span>Longitude (X)</span>
        <span />
      </div>

      <ul class="flex flex-col gap-3 sm:gap-2">
        <Index each={props.rows}>
          {(row, index) => {
            const rowId = () => row().id;
            const latError = () => fieldError(row(), "lat");
            const lngError = () => fieldError(row(), "lng");
            const rowMessage = () => rowError(row());
            return (
              <li class="grid grid-cols-[minmax(0,1fr)_2.75rem] gap-x-2 gap-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_2.75rem] sm:items-start sm:gap-3 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0">
                <span class="flex h-8 min-w-0 items-center text-xs font-semibold text-slate-500 sm:col-start-1 sm:row-start-1 sm:h-11">
                  <span class="sm:hidden">Titik {index + 1}</span>
                  <span class="hidden sm:inline">{index + 1}</span>
                </span>

                <div class="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                  <label for={`${rowId()}-lat`} class="mb-1 block text-xs font-medium text-slate-600 sm:sr-only">
                    Latitude (Y)
                  </label>
                  <input
                    id={`${rowId()}-lat`}
                    type="text"
                    inputmode="decimal"
                    autocomplete="off"
                    spellcheck={false}
                    value={row().lat}
                    disabled={props.disabled}
                    aria-invalid={latError() ? "true" : "false"}
                    aria-describedby={describedBy(row(), "lat")}
                    placeholder="-7.6114"
                    class={fieldClass(Boolean(latError()))}
                    onInput={(event) => {
                      updateField(rowId(), "lat", event.currentTarget.value);
                    }}
                    onBlur={() => markTouched(rowId(), "lat")}
                  />
                  <Show when={latError()}>
                    <p id={`${rowId()}-lat-error`} class="mt-1 text-xs text-rose-600">
                      {latError()}
                    </p>
                  </Show>
                </div>

                <div class="col-span-2 row-start-3 min-w-0 sm:col-span-1 sm:col-start-3 sm:row-start-1">
                  <label for={`${rowId()}-lng`} class="mb-1 block text-xs font-medium text-slate-600 sm:sr-only">
                    Longitude (X)
                  </label>
                  <input
                    id={`${rowId()}-lng`}
                    type="text"
                    inputmode="decimal"
                    autocomplete="off"
                    spellcheck={false}
                    value={row().lng}
                    disabled={props.disabled}
                    aria-invalid={lngError() ? "true" : "false"}
                    aria-describedby={describedBy(row(), "lng")}
                    placeholder="109.1773"
                    class={fieldClass(Boolean(lngError()))}
                    onInput={(event) => {
                      updateField(rowId(), "lng", event.currentTarget.value);
                    }}
                    onBlur={() => markTouched(rowId(), "lng")}
                  />
                  <Show when={lngError()}>
                    <p id={`${rowId()}-lng-error`} class="mt-1 text-xs text-rose-600">
                      {lngError()}
                    </p>
                  </Show>
                </div>

                <button
                  type="button"
                  class="col-start-2 row-start-1 grid h-11 w-11 place-items-center rounded-lg border border-rose-200 text-rose-600 transition hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 disabled:cursor-not-allowed disabled:opacity-40 sm:col-start-4 sm:row-start-1"
                  title={`Hapus titik ${index + 1}`}
                  aria-label={`Hapus titik ${index + 1}`}
                  disabled={props.disabled || props.rows.length <= 1}
                  onClick={() => removeRow(rowId())}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>

                <Show when={rowMessage()}>
                  <p id={`${rowId()}-row-error`} class="col-span-2 text-xs text-rose-600 sm:col-span-4">
                    {rowMessage()}
                  </p>
                </Show>
              </li>
            );
          }}
        </Index>
      </ul>

      <div class="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-emerald-200 px-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={props.disabled || props.rows.length >= POLYGON_MAX_POINTS}
          onClick={addRow}
        >
          <Plus size={16} aria-hidden="true" />
          Tambah Titik
        </button>
        <span class="text-xs text-slate-400">
          {props.rows.length}/{POLYGON_MAX_POINTS} titik
          <Show when={props.rows.length >= POLYGON_MAX_POINTS}> (maksimal)</Show>
        </span>
      </div>

      <Show when={formError()}>
        <p role="alert" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {formError()}
        </p>
      </Show>
    </div>
  );
}
