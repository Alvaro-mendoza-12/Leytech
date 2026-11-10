# Despliegue y operación

## Infraestructura

Next.js 16 en un runtime Node compatible (Node 22+), PostgreSQL externo con TLS y Supabase Storage para imágenes de administración. Puede ejecutarse en Vercel o un servidor Node con proxy HTTPS. No se aprovisionó infraestructura ni se validó un despliegue remoto.

1. Crea PostgreSQL, una cuenta de aplicación con permisos mínimos y un bucket privado `leytech-products` en Supabase Storage. Limita el bucket a JPEG/PNG/WebP y 5 MB.
2. Configura las variables abajo como secretos del proveedor. No incluyas `.env.local`, `.data` ni accesos locales en el despliegue.
3. En un entorno de mantenimiento con la conexión de destino, ejecuta `npm ci` y `npm run db:setup`. La primera migración crea tablas, relaciones, restricciones e índices. La carga inicial es idempotente, contiene ejemplos y no sobrescribe datos.
4. Crea el propietario con `npm run admin:create -- correo-del-propietario`. Conserva el secreto temporal en un gestor seguro; cámbialo al ingresar.
5. Ejecuta `npm run typecheck`, `npm test`, `npm run build`. Arranca con `npm start` o utiliza la integración oficial de Next.js del proveedor.
6. Configura dominio, certificado HTTPS y `NEXT_PUBLIC_SITE_URL` con el origen público exacto. Verifica las cookies Secure, encabezados y el rechazo de orígenes ajenos.
7. Programa cada minuto `npm run stock:expire` usando la base de producción. La expiración también ocurre al crear pedidos, abrir un pedido o consultar el panel. El comando periódico evita reservas retenidas en períodos sin visitas.
8. Sustituye los ejemplos por el catálogo real, completa los datos fiscales, políticas y opciones comerciales. No actives ventas hasta completar la lista de aceptación.

Las imágenes locales de demostración no son fotografías del catálogo real. Los archivos de `public/uploads` no se transfieren automáticamente a Supabase. Reemplázalos o migra explícitamente sus rutas antes de desplegar. La subida en producción exige almacenamiento externo y nunca escribe en el disco efímero del servidor.

## Variables de entorno

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Conexión PostgreSQL privada; obligatoria en producción |
| `DATABASE_SSL` | TLS verificado por defecto; `false` solo para desarrollo controlado |
| `PGLITE_PATH` | Directorio local; ignorar en producción |
| `NEXT_PUBLIC_SITE_URL` | Origen absoluto, sin barra final; debe coincidir con el navegador |
| `MERCADOPAGO_MODE` | `sandbox` primero; `live` solo después de validación comercial |
| `MERCADOPAGO_ACCESS_TOKEN` | Credencial privada del proveedor |
| `MERCADOPAGO_WEBHOOK_SECRET` | Secreto HMAC de Webhooks |
| `MERCADOPAGO_COLLECTOR_ID` | Identificador esperado del vendedor |
| `STORAGE_SUPABASE_URL` | URL HTTPS `https://<proyecto>.supabase.co` |
| `STORAGE_SERVICE_ROLE_KEY` | Clave privada, exclusiva del servidor |
| `STORAGE_BUCKET` | Bucket privado de imágenes del catálogo |
| `TRUST_PROXY` | `true` únicamente si tu proxy elimina y reescribe X-Forwarded-For |

`NEXT_PUBLIC_SITE_URL` es público. Ninguna otra credencial debe llevar el prefijo NEXT_PUBLIC. Si no se confía en un proxy, el límite de intentos se comparte conservadoramente entre visitantes; para tráfico real configura un proxy propio y comprueba que no acepta cabeceras de IP falsificadas.

## Mercado Pago

Se utiliza Checkout Pro alojado mediante Preferences API. No existe formulario propio de tarjetas. Configura Webhooks de pagos en `https://<dominio>/api/payments/webhook`. Debe llegar el parámetro `data.id`, `x-signature` y `x-request-id`. Se valida HMAC, antigüedad de cinco minutos, coincidencia del identificador y se consulta `/v1/payments/{id}` con la credencial privada.

Antes de aplicar un pago se verifican moneda PEN, monto exacto del pedido, referencia interna, cuenta receptora y entorno. Las preferencias solo se crean con URL HTTPS. El retorno a `/pedido/<token>` consulta el estado guardado y no aprueba el pedido. Una notificación aprobada consume la reserva una sola vez; si llegó después de expirar, deja el pedido para revisión. Un reembolso o contracargo actualiza su estado, sin reponer stock automáticamente: requiere revisar la devolución física.

Credenciales, cuentas de comprador/vendedor de prueba y dominio HTTPS no estaban disponibles. **No se ejecutó un cobro sandbox oficial.** Comprueba éxito, rechazo, abandono, notificación repetida, recuperación tras caída, cuenta/importe incorrectos y pago tardío antes de pasar a `live`. Se contempla estado de reembolso, pero su solicitud al proveedor debe gestionarse en Mercado Pago; no hay botón que simule un reembolso.

Referencias: [Preferencias de Checkout Pro](https://www.mercadopago.com.pe/developers/es/docs/checkout-pro-preferences/create-payment-preference), [Webhooks](https://www.mercadopago.com.pe/developers/es/docs/checkout-pro-preferences/additional-content/notifications/webhooks), [Almacenamiento privado Supabase](https://supabase.com/docs/guides/storage/serving/downloads).

## Respaldos y mantenimiento

PostgreSQL: activa snapshots y recuperación a un punto en el tiempo cuando el proveedor lo permita. Genera respaldos `pg_dump` en formato custom y prueba `pg_restore` sobre una base vacía de prueba. Define retención, cifrado, responsables y alertas de fallos. Se deben respaldar también imágenes, configuración y secretos mediante sus canales apropiados. Nunca vuelques datos personales en logs públicos.

PGlite local: detén el único proceso que lo usa y copia `.data/leytech` a una ubicación de respaldo; prueba la copia en un directorio distinto con `PGLITE_PATH`. No se realizó una restauración operativa en este encargo.

Establece monitoreo para errores 5xx, pagos en revisión, webhooks rechazados, tiempo de respuesta, reservas vencidas y solicitudes del libro. El panel muestra los últimos 200 pedidos/cotizaciones y 100 movimientos/eventos: sus indicadores cubren ese historial cargado, no una contabilidad completa. Para mayor volumen añade agregaciones SQL, exportación y paginación administrativa.

El email transaccional, recuperación automática de contraseñas y envío de constancias del libro por correo siguen pendientes de proveedor. Mientras no exista recuperación por email, crea un acceso de propietario nuevo desde el entorno de mantenimiento, desactiva la cuenta anterior y registra el incidente. Añade MFA antes de operaciones de mayor escala.
