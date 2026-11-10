# Entrega y verificación de Leytech

Fecha local: 9 de noviembre de 2026. Estado: **aplicación local funcional de demostración; lanzamiento comercial pendiente**. No se publicaron servicios externos ni se enviaron mensajes a terceros.

## Implementado

Tienda responsive con buscador, categorías, filtros por marca/color/precio, orden, paginación, detalle de producto, variantes con SKU/precio/stock/imagen, galería, ficha técnica, carrito persistente y mensajes de precio cambiado. Secciones informativas editables, contacto, preguntas frecuentes, libro condicional, metadatos, robots, sitemap y datos estructurados solo para productos reales publicados.

Cotización individual y de carrito con validación en servidor, instantánea de precios, código único, persistencia, enlace oficial WhatsApp codificado y seguimiento administrativo. Una cotización no afecta stock ni demuestra que el cliente haya enviado el mensaje.

Checkout como invitado, importes en céntimos PEN, costos de entrega explícitos, pedidos con token privado y precios históricos, reserva de stock de 30 minutos, liberación por cancelación/expiración e idempotencia. El servidor controla las cantidades y los precios. Los reintentos del checkout conservan su clave en la sesión del navegador.

Panel privado con seis áreas y operaciones reales. Producto en seis pasos, borradores/publicación/archivo/duplicación, carga y reordenamiento de imágenes, variantes, categorías/subcategorías, marcas, movimientos de inventario con motivo, pedidos/cotizaciones, pagos, clientes, entrega, contenido del inicio, logo/color/WhatsApp, usuarios propietario/personal y cambio de contraseña. Auditoría administrativa y revocación de sesiones.

Integración de Checkout Pro con preferencia y Webhook verificado; respuestas de pago no se confían al navegador. Adaptador de Supabase Storage para producción, carga local en desarrollo. Ambos servicios externos pendientes de configurar y probar con credenciales oficiales.

## Módulos y migraciones

- `src/app/(store)`: páginas públicas y flujos comerciales.
- `src/app/admin`, `src/components/admin`: acceso y administración.
- `src/app/api/[...path]/route.ts`: HTTP con validación y autorización.
- `src/lib/catalog.ts`, `commerce.ts`, `admin.ts`: catálogo, cotizaciones, pedidos, stock y gestión.
- `src/lib/security.ts`, `payments.ts`, `storage.ts`: sesiones/controles, proveedor de pagos y archivos.
- `migrations/001_initial.sql`: 16 tablas, incluido el registro de migración; relaciones, restricciones e índices. No se modificó ninguna base previa porque el directorio inicial estaba vacío.
- `scripts`: instalación, administrador, expiración, pruebas HTTP y axe.
- `tests/commerce.test.ts`: pruebas aisladas con PostgreSQL embebido en memoria.

La arquitectura completa está en `ARQUITECTURA.md`; operación y variables en `DESPLIEGUE.md`.

## Pruebas ejecutadas

Resultados concretos de esta entrega, sin equivaler a certificaciones:

| Verificación | Resultado |
| --- | --- |
| TypeScript, `npm run typecheck` | Correcto |
| Compilación de producción, `npm run build` | Correcta, sin advertencias en la ejecución final |
| Pruebas automatizadas de negocio/seguridad | 24 casos: sesión, contraseñas, origen, cuerpos, catálogo, tres colores, filtros, stock, cotización, precios, pedidos, concurrencia, historial, cancelación, expiración, firma, pagos duplicados/tardíos, entrega y color accesible |
| Pruebas HTTP contra servidor local | 19 comprobaciones correctas; autenticación, permisos, subida de imagen real, rechazo SVG, catálogo, cotización persistida, pedido, stock, precio, archivo, revocación |
| Navegador Chromium con Playwright CLI | Búsqueda, variante agotada bloqueada, cambio a blanco, cantidad 2, carrito recuperado/eliminación, cotización COT-00001, pedido PED-00001, clave de reintento conservada al recargar checkout, acceso privado, creación de producto con fotografía y tres variantes guardado como borrador |
| axe-core: inicio, catálogo, ficha, carrito, checkout y resumen administrativo | 12 combinaciones a 390 y 1440 px, sin infracciones automáticas tras corregir contraste; sin desbordamiento horizontal |
| Dependencias, npm audit | 0 vulnerabilidades reportadas en la ejecución |

Evidencia local: `output/http-smoke.json`, `output/a11y-report.json` y capturas en `output/playwright`. Estos archivos no se incluyen en control de versiones. Los pasos de navegador también generaron snapshots en `.playwright-cli`.

Las pruebas de pagos usan objetos de ejemplo controlados contra los servicios internos y HMAC. **No se realizó una compra oficial de Mercado Pago sandbox ni se recibió un Webhook real del proveedor.** Tampoco se probó Supabase Storage remoto, PostgreSQL administrado, múltiples procesos reales, restauración de backups, email ni un despliegue público.

axe verifica solo una parte de WCAG. No se declara conformidad WCAG 2.2 AA completa. Se implementaron etiquetas, foco visible, salto al contenido, navegación semántica, diálogo con Escape/foco contenido, controles táctiles y preferencia de movimiento reducido. Falta evaluación con lector de pantalla y dispositivos/navegadores adicionales.

Core Web Vitals: objetivos LCP ≤2.5 s, INP ≤200 ms y CLS ≤0.1 para el percentil 75. Se usan imágenes adaptativas AVIF/WebP, tamaños de galería reservados y carga diferida. **No se midieron métricas de campo ni se declara un puntaje Lighthouse.** Medir en despliegue de producción, con red móvil real y datos representativos.

## Benchmarking: observaciones y límites

Se consultaron las versiones textuales públicas, no flujos completos de compra:

| Referencia | Observación utilizable |
| --- | --- |
| [Coolbox](https://www.coolbox.pe/) | Buscador destacado, categorías, ubicación y ayuda de entrega visibles |
| [Memory Kings](https://www.memorykings.pe/) | Organización detallada de periféricos, componentes, redes, software y marcas |
| [Impacto](https://www.impacto.com.pe/) | Navegación por intención (PC gamer, laptops, monitores), ofertas y novedades |
| [Hiraoka](https://hiraoka.com.pe/) | Taxonomía extensa y avisos de cobertura; no se verificó un proceso de pago |
| [Mercado Libre](https://www.mercadolibre.com.pe/) | Acceso bloqueado con HTTP 403; no se declara inspección del sitio |
| [Amazon](https://www.amazon.com/) | Verificación antibot; no se declara inspección de variantes/checkout |

Las decisiones de interfaz son propias. No se copió identidad ni recursos de estas tiendas.

## Checklist de seguridad

- [x] Contraseña con salt y scrypt; sesiones aleatorias de 256 bits con hash persistido.
- [x] Cookie HttpOnly, SameSite estricto, Secure en producción, caducidad y revocación.
- [x] Autorización en servidor y separación propietario/personal.
- [x] Origen obligatorio en mutaciones de navegador; validación Zod, límites de cuerpo e intentos.
- [x] SQL parametrizado, texto escapado por React, imágenes limitadas por tamaño y firma; SVG no aceptado.
- [x] CSP, anti framing, nosniff, Referrer Policy, Permissions Policy.
- [x] Precios del servidor, importes enteros, restricciones de inventario y transacciones.
- [x] HMAC de pagos, consulta al proveedor, moneda/monto/cuenta/entorno, idempotencia y auditoría.
- [x] Secretos y datos locales excluidos del repositorio; no hay claves privadas en el cliente.
- [ ] HTTPS y proxy real, monitoreo, MFA y rotación de secretos.
- [ ] Revisión independiente ASVS, prueba de carga, restauración de respaldo y endurecimiento de infraestructura.
- [ ] Revisar retención, cifrado de respaldos, ejercicio de derechos y gestión de incidentes con el negocio.

## Checklist de aceptación

- [x] Administrador inicia sesión y puede crear producto con tres colores/stock independiente.
- [x] Producto publicado por API, encontrado mediante búsqueda pública.
- [x] Variante, cantidades, carrito, importe y cotización persistida con código y mensaje correctos.
- [x] La cotización aparece en el panel; pedido guardado y visible en administración.
- [x] Acceso sin sesión bloqueado; personal sin permisos de propietario rechazado.
- [x] Webhook interno con firma incorrecta rechazado; fixtures de pago duplicado no descuentan dos veces.
- [x] UI revisada a 390 y 1440 px, pruebas automáticas de accesibilidad con los límites indicados.
- [ ] Compra oficial de sandbox y notificación real del proveedor.
- [ ] PostgreSQL de producción, almacenamiento externo y restauración verificada.
- [ ] Catálogo/precios/stock reales, autorización de licencias, razón social/RUC/dirección y políticas aprobadas.
- [ ] Envíos, comprobantes tributarios, impuestos aplicables y medios de pago confirmados por el negocio.
- [ ] Libro de Reclamaciones revisado en formato/legalidad, entrega de constancia por correo y proceso de respuesta operativo.
- [ ] Pruebas de usabilidad con clientes, lector de pantalla, Safari/Firefox, rendimiento y observabilidad en producción.

No se afirman certificaciones ISO, WCAG, OWASP ASVS ni PCI DSS.

## Pendientes y riesgos

La administración muestra un máximo de 1000 productos y el historial reciente indicado en DESPLIEGUE.md. Ampliar paginación y agregaciones antes de crecer. Se admite una zona/tarifa de envío: otras zonas se atienden por cotización. Las licencias digitales se entregan manualmente y no incluyen un almacén de claves. No hay cupones, email transaccional, MFA, recuperación automática por correo ni facturación electrónica integrada.

El libro permite registrar solicitudes y administrarlas, pero no se presenta como legalmente validado: falta completar la constancia oficial, los casos especiales y el envío por correo. Referencias para su revisión: [Indecopi: libro en comercio electrónico](https://www.gob.pe/institucion/indecopi/noticias/1286430-comercios-electronicos-tambien-estan-obligados-a-contar-con-libro-de-reclamaciones-activo-y-visible), [orientación del Libro de Reclamaciones](https://consumidor.gob.pe/libro-de-reclamaciones/), [ANPD: reglamento de protección de datos](https://www.gob.pe/institucion/anpd/campa%C3%B1as/128319-nuevo-reglamento-de-proteccion-de-datos-personales). Un responsable del negocio debe definir la aplicación legal y comercial al lanzamiento.

La documentación y la interfaz mantienen estos límites visibles. El paso siguiente del lanzamiento depende de datos reales del negocio y credenciales oficiales, no de activar una simulación de cobro.
