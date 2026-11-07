/** 1.5 s "Copied to clipboard" notice shown after the palette closes. */
export function Toast({ message }: { message: string }) {
  return (
    <div className="kt" role="status" aria-live="polite">
      <span className="kp-dot" />
      {message}
    </div>
  );
}
