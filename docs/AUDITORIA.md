# Auditoría funcional de Leytech

## Alcance

Tienda, panel y base de datos de Leytech. Se revisaron la portada, el catálogo, la ficha, el carrito, la atención por WhatsApp, el Libro de Reclamaciones y las señales públicas para buscadores. La validación de flujos con escrituras usa datos aislados de prueba.

## Requisitos funcionales

| ID | Resultado esperado |
| --- | --- |
| RF-01 | Un producto publicado desde el panel aparece en el catálogo y, según su antigüedad, en la rotación de portada y las novedades. |
| RF-02 | Buscar por nombre, marca, categoría, SKU o términos equivalentes devuelve productos visibles. Los filtros de precio, color y ofertas se pueden aplicar y quitar. |
| RF-03 | Seleccionar una variante actualiza su precio, disponibilidad y foto asociada. La ficha permite recorrer y ampliar fotos. |
| RF-04 | Desde el carrito se puede preparar una cotización y abrir WhatsApp en dos acciones. La última cotización se conserva en el mismo navegador y aparece en el panel. |
| RF-05 | El Libro registra la solicitud, muestra su constancia y permite al personal autorizado consultarla y marcarla como atendida. |
| RF-06 | Las páginas públicas canónicas tienen título, descripción y vista previa al compartir. El sitemap contiene el catálogo real y las páginas de información. |

## Requisitos no funcionales

- Diseño adaptable probado a 390 y 1440 píxeles. La rotación respeta la preferencia de movimiento reducido. Los controles aparecen al navegar por teclado y el zoom admite Escape.
- El panel y la tienda leen de Supabase. Mientras están visibles, consultan cambios cada cuatro y cinco segundos respectivamente. Las pestañas del mismo navegador se notifican entre sí.
- Los códigos del carrito se conservan localmente. Las solicitudes, credenciales y datos de contacto privados requieren controles de acceso del servidor. Los precios y el stock se validan al preparar la cotización.
- Los enlaces compartidos usan una tarjeta de 1200 × 630 píxeles para Leytech y la foto principal para productos con imagen. Los buscadores seleccionan el título, la descripción y los elementos que muestran.

## Reglas de negocio

- La compra, el pago y la entrega se acuerdan por WhatsApp. Preparar una cotización genera una referencia y conserva el stock disponible.
- El carrito admite cantidades enteras hasta el menor valor entre 99 y el stock disponible de la variante. Si cambia el carrito, el código anterior se conserva como referencia histórica.
- Las ofertas se basan en precios reales publicados con un precio anterior mayor. Los productos de muestra conservan su etiqueta y quedan fuera del sitemap.
- Las fichas privadas, carrito, pedidos y panel quedan fuera de la indexación. Las búsquedas internas y combinaciones de filtros apuntan a su catálogo canónico.
- Los datos de reclamaciones se muestran en el panel autenticado. El código entregado al consumidor sirve como referencia para el seguimiento con Leytech.

## Revisión de las diez heurísticas

| Heurística | Evidencia aplicada |
| --- | --- |
| Estado visible | Stock por variante, carga de búsquedas y código de solicitud. |
| Lenguaje del usuario | «Preparar cotización», «Abrir WhatsApp», «Quitar ofertas». |
| Control y libertad | Eliminar del carrito, quitar filtros y cerrar la galería con Escape. |
| Consistencia | Navegación, precios en soles y acciones con la misma terminología. |
| Prevención de errores | Cantidades limitadas y validación de stock y precio en servidor. |
| Reconocimiento | Sugerencias con nombre y foto, y variantes con etiqueta de color. |
| Flexibilidad | Navegación por teclado, controles táctiles y filtro directo por precio. |
| Diseño sencillo | Portada con mensaje fijo y rotación de imágenes sin contador visible. |
| Recuperación | Estado sin ofertas, rango invertido ajustado y recuperación de la última cotización. |
| Ayuda | Envíos, preguntas frecuentes, atención por WhatsApp y Libro de Reclamaciones. |

## Rastreo e indexación

El origen de producción se fija con `NEXT_PUBLIC_SITE_URL`. `robots.txt` publica el enlace a `sitemap.xml`. Se puede verificar la propiedad con `GOOGLE_SITE_VERIFICATION` o `BING_SITE_VERIFICATION`. La solicitud de rastreo a Google se realiza desde una propiedad verificada de Search Console. La clave de IndexNow se configura en Vercel y se sirve en su URL de verificación. Al guardar productos reales o la configuración de la tienda en producción, se envía una notificación a IndexNow después de confirmar el cambio. El perfil oficial de TikTok se enlaza en el pie de página y en los datos de la organización.

Referencias de implementación. [Nielsen Norman Group](https://www.nngroup.com/articles/ten-usability-heuristics/) · [Google Search Central](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl) · [IndexNow](https://www.indexnow.org/documentation).
