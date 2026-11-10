export default function Loading() {
  return (
    <div
      className="container loading-grid"
      role="status"
      aria-label="Cargando productos"
    >
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  );
}
