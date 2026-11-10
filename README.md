# Leytech

Tienda de tecnología para Perú y panel administrativo. Marca configurada: **Leytech**. WhatsApp: **+51 905 886 853** (`51905886853`).

El proyecto funciona localmente en demostración. **No está habilitado ni validado para ventas reales.** Los productos, precios y existencias iniciales son de ejemplo. No se efectuaron cobros.

## Abrir esta instalación

Tienda: <http://localhost:3001>. Panel: <http://localhost:3001/admin>.

Se creó el propietario local `admin@leytech.local`. La contraseña aleatoria está en `.data/admin-access.txt`, un archivo local excluido del repositorio. Cámbiala en Configuración → Seguridad y elimina ese archivo cuando ya no lo necesites. El correo funciona como identificador local; no es un buzón de atención.

Si el servidor no está ejecutándose:

```powershell
cd D:\Leytech
npm run dev -- --port 3001
```

## Instalación desde cero

Requiere Node.js 22 o posterior; probado con Node 26.13.0 y npm 11.20.0. Dependencias fijadas en `package-lock.json`.

```powershell
npm ci
Copy-Item .env.example .env.local
npm run db:setup
npm run admin:create -- propietario@ejemplo.com
npm run dev
```

La URL de `NEXT_PUBLIC_SITE_URL` debe coincidir exactamente con el origen del navegador, incluido el puerto. El ejemplo usa 3000; esta instalación usa 3001. No reemplaces un `.env.local` existente sin revisar su contenido.

En local, PGlite conserva PostgreSQL en `.data/leytech`. Es de un solo proceso: detén el servidor antes de ejecutar migraciones, crear administradores o respaldar esa base. Las pruebas unitarias usan una base independiente en memoria.

## Qué puedes administrar

- Resumen: ventas reales confirmadas, pedidos, cotizaciones, stock bajo y auditoría.
- Catálogo: productos con seis pasos, imágenes, variantes, precios, borradores, publicación, archivo, duplicación, categorías/subcategorías, marcas y ajustes de inventario.
- Ventas: pedidos, cotizaciones, pagos verificados, preparación y entrega, solicitudes del libro.
- Clientes: datos e historial derivados de pedidos, con búsqueda.
- Marketing: título, texto y fotografía del banner; destacados y ofertas desde productos.
- Configuración: marca, logo, color, WhatsApp, datos legales, transferencia, entrega, políticas, usuarios, roles y cambio de contraseña.

El personal administra las operaciones; solo un propietario puede cambiar la configuración o gestionar usuarios. No existen contraseñas predeterminadas.

## Flujo de prueba

1. Busca un mouse y abre su ficha. Azul tiene stock cero; la compra queda deshabilitada.
2. Selecciona Blanco, elige una cantidad y agrégala al carrito.
3. Cotiza el carrito. Se guarda un código `COT-…` y se prepara el enlace oficial de WhatsApp. El envío del mensaje queda a cargo del cliente.
4. Consulta la cotización en Ventas → Cotizaciones.
5. Crea un pedido de demostración usando datos ficticios. Se guarda `PED-…` con reserva de 30 minutos, sin cobro.
6. Revisa el pedido en el panel. Cancelarlo libera la reserva. Una confirmación manual exige indicar cómo se verificó el pago y se registra en auditoría.

Se conservaron una cotización, pedidos y productos identificados como pruebas para facilitar la revisión. El producto HTTP fue archivado; el producto creado desde la interfaz quedó como borrador. El usuario de personal de prueba quedó desactivado.

## Verificar

```powershell
npm run typecheck
npm test
npm run build
# Con servidor local activo y modo demostración:
npm run test:http
```

Las pruebas HTTP leen el acceso local o `SMOKE_ADMIN_EMAIL`/`SMOKE_ADMIN_PASSWORD`. Solo funcionan cuando `demoMode=true`; generan datos de prueba y archivan el producto al finalizar. No se deben ejecutar contra un negocio real.

Para repetir axe en un navegador de Playwright CLI abierto:

```powershell
npx --yes --package @playwright/cli playwright-cli -s=leytech open http://localhost:3001
# Inicia sesión en ese navegador para incluir el panel administrativo.
./scripts/a11y.ps1
```

Consulta `docs/ENTREGA.md` para los resultados, límites y checklist. Las pruebas con respuestas de pago de ejemplo no sustituyen una compra oficial de sandbox.

## Producción

Usa PostgreSQL administrado y almacenamiento persistente; la aplicación rechaza PGlite en `NODE_ENV=production`. Despliegue detallado, variables, respaldos y pendientes en `docs/DESPLIEGUE.md`. No se publicó un sitio ni se configuraron cuentas externas.

Estructura: `src/app` (rutas), `src/components` (interfaces), `src/lib` (servicios), `migrations` (SQL), `scripts` (operación) y `tests` (negocio/seguridad). Arquitectura y decisiones en `docs/ARQUITECTURA.md`.
