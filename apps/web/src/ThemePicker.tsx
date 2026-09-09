import type { HomeTheme } from "./worlds";

export function ThemePicker({ value, onChange }: { value: HomeTheme; onChange: (theme: HomeTheme) => void }) {
  return (
    <fieldset className="home-theme-picker">
      <legend className="sr-only">Thème global d’IDA</legend>
      {([['classic', 'Classic'], ['scifi', 'Sci-Fi'], ['immersive', 'Immersive']] as const).map(([id, label]) => (
        <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>{label}</button>
      ))}
    </fieldset>
  );
}
