# Estado de entrega

## Producción

Leytech está publicada en https://leytech-ochre.vercel.app con administración en /admin, PostgreSQL administrado y almacenamiento privado de Supabase. El modo demostración está desactivado y las ventas se coordinan por WhatsApp al +51 905 886 853.

El propietario cargará el catálogo real y completará los datos comerciales desde el panel. Los 12 ejemplos iniciales están como borradores editables. No se publicaron precios o existencias ficticias ni se generaron cobros o pedidos de venta de prueba en la base de producción.

## Verificaciones

- TypeScript y compilación correctos. Vercel informa el despliegue como Ready.
- 26 pruebas de negocio y seguridad correctas: sesiones, origen, catálogo, variantes, precios, inventario, concurrencia, pedidos, reservas, expiración e idempotencia. Incluyen venta acordada por WhatsApp con correo opcional y rechazo de ejemplos en modo real.
- Conexión real con cuenta técnica y certificado TLS verificado. Las 16 tablas tienen RLS; la clave pública no permite leer administradores, sesiones, pedidos o configuración.
- Inicio y acceso del propietario comprobados desde el navegador en producción.
- Subida y recuperación de una fotografía en Supabase verificadas byte por byte; conservada en un borrador editable.
- Políticas iniciales publicadas y editables, adaptadas a WhatsApp.

La instalación local previa tuvo 19 comprobaciones HTTP y 12 combinaciones de páginas/tamaños con axe sin infracciones automáticas. Es evidencia local, no una certificación ni una medición de campo. Las capturas y reportes están en output, excluido de Git.

## Uso diario

Publica los productos reales desde Catálogo. Atiende el código del cliente en Ventas → Solicitudes de WhatsApp. Después del acuerdo registra el pedido con sus datos y costo de entrega. Confirma el pago solo después de verificar el ingreso y actualiza preparación, envío y entrega.

## Límites concretos

No hay facturación electrónica, correo transaccional, recuperación de contraseña por correo, MFA ni entrega automática de licencias. Se documentan para distinguirlas de las funciones configuradas; el flujo de catálogo y WhatsApp no depende de una pasarela.

El Libro guarda solicitudes e imprime constancias, pero el titular debe completar sus datos y revisar requisitos aplicables. No se verificaron constancias por email, restauración de backups, carga masiva ni Core Web Vitals de campo. Los indicadores administrativos cubren el historial cargado.

No se afirman certificaciones legales, ISO, WCAG, OWASP ASVS o PCI DSS. Orientación del negocio: [Libro de Reclamaciones](https://consumidor.gob.pe/libro-de-reclamaciones/).
