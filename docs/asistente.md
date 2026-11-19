# Leytech Asistente en la tienda

La sección pública vive en `/asistente`. El comprador descarga el instalador y solicita por WhatsApp el código usando su referencia de compra. La página usa el número de WhatsApp configurado en Leytech.

## Emisión en equipo

El propietario crea una cuenta para cada operador desde **Configuración → Usuarios**. El propietario y el personal activo pueden abrir **Licencias** en el panel.

1. Comprueba que se cobró la compra y que incluye el asistente.
2. Pega la referencia `COT-…` para ventas por WhatsApp o `PED-…` para pedidos en el sistema. Si la referencia tiene un pedido asociado, su estado debe ser **Pagado**.
3. Marca la confirmación y pulsa **Generar código**. Pulsa **Copiar mensaje para WhatsApp**, pégalo en el chat del comprador y envíalo.
4. El comprador pega el código `LT2-…` en la aplicación y pulsa **Activar** con conexión. El código se consume al confirmarse el primer canje.

El registro central muestra quién emitió el código y cuándo se canjeó. Una cotización y su pedido vinculado cuentan como la misma compra. Se puede recuperar el mismo código mientras esté sin usar. Después del canje, la activación queda guardada en el equipo y funciona sin conexión. Los códigos de la prueba anterior que comienzan con `LT1-` no funcionan con esta versión.

## Configuración de Vercel

1. Usa la conexión PostgreSQL existente de la tienda. El registro de licencias vive bajo los prefijos privados `assistant:purchase:` y `assistant:code:` de la tabla de configuración, con las mismas reglas de acceso que las cuentas del panel. El canje se registra en una transacción de PostgreSQL.
2. Prepara una clave Ed25519 de la tienda. Empaqueta Windows con su clave pública hexadecimal y la URL `https://TU-TIENDA/api/assistant/redeem` mediante `packaging/build.ps1` del repositorio del asistente. Usa una clave diferente para las pruebas.
3. Configura en Vercel `LEYTECH_ASSISTANT_SIGNING_KEY` como secreto de servidor con el DER PKCS#8 de la clave privada codificado en Base64 y `LEYTECH_ASSISTANT_PUBLIC_KEY` con la clave pública hexadecimal que incluiste en el instalador. La emisión se bloquea si las dos claves no corresponden.
4. Publica el instalador final en almacenamiento de archivos, por ejemplo Vercel Blob público, y coloca su URL HTTPS en `LEYTECH_ASSISTANT_DOWNLOAD_URL`. Configura la respuesta del almacenamiento como descarga con nombre `Leytech-Asistente-Windows-x64.exe`. El ejecutable se sirve directamente desde el almacenamiento y no viaja dentro del repositorio.
5. Verifica en una vista previa la descarga, el acceso con una cuenta de personal y la activación con el instalador asociado a la clave. Publica los cambios en el proyecto Vercel de Leytech cuando se apruebe la revisión.

Para una prueba local, coloca el instalador de revisión en `public/descargas/Leytech-Asistente-Windows-x64.exe` y usa esa ruta en `LEYTECH_ASSISTANT_DOWNLOAD_URL`. El ejecutable local queda excluido de Git y de la subida de Vercel.
