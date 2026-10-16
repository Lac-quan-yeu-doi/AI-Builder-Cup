interface GoogleDriveIconProps {
  readonly size?: number;
  readonly className?: string;
}

export function GoogleDriveIcon({ size = 24, className }: GoogleDriveIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <path d="M8.25 2.5 1.5 14.25h5.94L14.19 2.5z" fill="#0066DA" />
      <path d="M15.75 2.5 8.25 15.75h-6.6L9 21.5h13.5l3.37-5.75z" fill="#00AC47" />
      <path d="M22.5 14.25 15.75 2.5l-6.56 11.5 3.37 5.75H22.5z" fill="#EA4335" />
      <path d="M8.25 15.75 9 21.5h4.56l3.37-5.75z" fill="#00832D" />
      <path d="M15.75 2.5 14.19 2.5 7.44 14.25l.81 1.5z" fill="#2684FC" />
      <path d="M22.5 14.25h-5.94l-3.37 5.75H22.5z" fill="#FFBA00" />
    </svg>
  );
}
