export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Clarix"
    >
      <rect width="40" height="40" rx="9" fill="#0A0A0F" />
      {/* outer ring */}
      <path
        d="M29.01 26.31 A 11 11 0 1 1 29.01 13.69"
        fill="none"
        stroke="#F4F4F6"
        strokeWidth="3.6"
        strokeLinecap="round"
      />
      {/* inner ring */}
      <path
        d="M24.92 23.44 A 6 6 0 1 1 24.92 16.56"
        fill="none"
        stroke="#7C6FE0"
        strokeWidth="3.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
