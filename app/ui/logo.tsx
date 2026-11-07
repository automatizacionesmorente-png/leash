export function Logo() {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="10" cy="22" r="6" fill="none" stroke="var(--color-leather)" strokeWidth="3" />
        <path d="M14.5 17.5 C 20 12, 22 8, 27 5" fill="none" stroke="var(--color-ink)" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="font-serif text-2xl tracking-tight">Leash</span>
    </span>
  );
}
