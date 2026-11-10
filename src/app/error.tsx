"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="container page-container">
      <div className="empty-state">
        <h1>No pudimos cargar esta página</h1>
        <p>Intenta de nuevo. Si el problema continúa, vuelve al inicio.</p>
        <button className="btn btn-primary" onClick={reset}>
          Volver a intentar
        </button>
        <a href="/" className="btn btn-outline" style={{ marginLeft: 10 }}>
          Ir al inicio
        </a>
      </div>
    </div>
  );
}
