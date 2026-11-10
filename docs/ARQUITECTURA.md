# Leytech: decisiones e inspección inicial

Fecha: 9 de noviembre de 2026. Directorio inicial vacío: no existían código, dependencias, datos ni funcionalidades que conservar. Marca: Leytech. WhatsApp: +51 905 886 853, prefijo peruano inferido del encargo; editable en administración.

## Arquitectura

Next.js App Router y TypeScript: páginas renderizadas en servidor, interactividad React, rutas HTTP y servicios independientes. CSS con tokens propios y Lucide. PostgreSQL en producción mediante pg; PGlite, PostgreSQL embebido, para desarrollo local sin credenciales. La misma migración SQL sirve a ambos. PGlite es de un único proceso y no sirve para desplegar múltiples instancias. Producción falla sin DATABASE_URL. Migraciones y carga de ejemplos son comandos explícitos, nunca ejecutados durante build ni solicitudes.

Importes enteros en céntimos PEN; disponibilidad por variante. Precios y cantidades se validan en servidor. Cotizaciones conservan una instantánea, generan código y enlace wa.me, sin reservar stock ni afirmar que el mensaje fue enviado. Pedidos reservan unidades mediante actualizaciones condicionales dentro de transacciones. Expiran a los 30 minutos. El pago aprobado consume la reserva una sola vez. Pagos tardíos quedan para revisión, sin crear inventario negativo.

Sesiones opacas aleatorias, hash en base de datos, cookies HttpOnly/SameSite, scrypt, autorización en servidor, validación Zod, origen estricto en mutaciones, límites de intentos persistentes. No hay usuario ni contraseña predeterminados. El administrador se crea por CLI. Auditoría para cambios administrativos. Fotografías locales y carga de imágenes con límites y firma binaria. No se aceptan SVG cargados.

Mercado Pago: Checkout Pro alojado; sin formulario de tarjetas. Preferencia creada desde precios del servidor, webhook con HMAC y consulta posterior al proveedor. Se verifica cuenta receptora, referencia, moneda, monto y entorno. La redirección del navegador no confirma pagos. Falta probar con credenciales oficiales del comerciante. Las transferencias manuales solo se habilitan con instrucciones reales configuradas; no se inventan cuentas.

## Diseño

Paleta: azul #2563EB, tinta #0F172A, fondo #F5F7FB, blanco #FFFFFF, amarillo #FACC15, WhatsApp #15803D. Tipografía: Manrope variable local con respaldo sans de sistema, titulares densos y amplios, texto legible. Una cabecera comercial con buscador, navegación por necesidad, hero azul oscuro con fotografía de audio y tarjetas de producto blancas. El catálogo y la ficha muestran variante, stock y precio juntos. Panel de navegación lateral con seis áreas. Evitar claims de envíos gratis, garantías o descuentos sin fundamento comercial.

Revisión del plan: las ventajas de compra se redactan como funciones comprobables (cotizar, comprar como invitado, precios en soles), no como promesas comerciales. Datos de catálogo identificados como ejemplos; no son disponibilidad ni promociones reales. Fotografías ilustrativas de Unsplash, sin atribuir modelos o marcas a las imágenes.

## Referencias de benchmarking

Se consultaron páginas públicas, no se realizaron compras ni auditorías completas. Resultados y límites de acceso se registran en ENTREGA.md. Referencias de interés: Amazon (selección de variante), Mercado Libre (búsqueda), Coolbox (categorías), Memory Kings (taxonomía), Impacto (navegación comercial), Hiraoka (precios). Ningún recurso de esas tiendas se reutiliza.

## Rutas

`/`, `/catalogo`, `/producto/[slug]`, `/carrito`, `/checkout`, `/pedido/[token]`, `/informacion/[slug]`, `/reclamaciones`, `/admin/login`, `/admin`. API: catálogo, cotizaciones, pedidos y panel bajo `/api`; notificaciones de Mercado Pago separadas del middleware de origen.

## Límites de lanzamiento

Pendientes datos fiscales/RUC y razón social, dirección, tarifas y zonas reales, políticas aprobadas por el negocio, proveedor de email, credenciales y sandbox de pagos, configuración y validación del adaptador de almacenamiento de objetos para despliegue efímero, dominio/HTTPS, backups y restauración, monitoreo y verificación legal/accesibilidad/rendimiento independientes. No hay certificación ISO, WCAG, ASVS ni PCI.
