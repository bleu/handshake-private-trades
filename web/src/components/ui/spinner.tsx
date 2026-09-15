export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="loading-spinner" role="status" aria-label={label}>
      <span className="spinner-ring" aria-hidden="true" />
    </span>
  );
}
