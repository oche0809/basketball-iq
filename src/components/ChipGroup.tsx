// 絞り込みのボタン群（MAP・COACH で共通）。押したボタンが選ばれた状態になる
export function ChipGroup<T extends string>({ label, value, options, onChange }: { label: string; value: T | ''; options: { value: T | ''; text: string }[]; onChange: (v: T | '') => void }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-bold">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value || 'all'}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`min-h-11 rounded-full border px-3.5 text-sm font-bold ${value === o.value ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--line)] bg-[var(--surface)]'}`}
          >
            {o.text}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
