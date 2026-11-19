# Leytech Asistente en la tienda

La sección pública vive en `/asistente`. El comprador descarga el instalador y solicita por WhatsApp el código. La página usa el número de WhatsApp configurado en Leytech.

## Emisión en equipo

El propietario crea una cuenta para cada operador desde **Configuración → Usuarios**. El propietario y el personal activo pueden abrir **Licencias** en el panel.

1. Pulsa **Generar licencia**.
2. Pulsa **Copiar licencia** y envíala por WhatsApp.
3. El comprador pega el código `LT2-…` en la aplicación y pulsa **Activar** con conexión. El código se consume al confirmarse el primer canje.

El registro muestra quién emitió cada licencia y cuándo se canjeó. El panel no solicita datos del comprador. Después del canje, la activación queda guardada en el equipo y funciona sin conexión. Los códigos `LT2-` emitidos antes de este cambio conservan su estado.

## Configuración de Vercel

1. Usa la conexión PostgreSQL existente de la tienda. El registro usa las entradas privadas `assistant:license:` y `assistant:code:` de la tabla de configuración y sigue reconociendo las licencias anteriores guardadas con `assistant:purchase:`. El canje se registra en una transacción de PostgreSQL.
2. Prepara una clave Ed25519 de la tienda. Empaqueta Windows con su clave pública hexadecimal y la URL `https://TU-TIENDA/api/assistant/redeem` mediante `packaging/build.ps1` del repositorio del asistente. Usa una clave diferente para las pruebas.
3. Configura en Vercel `LEYTECH_ASSISTANT_SIGNING_KEY` como secreto de servidor con el DER PKCS#8 de la clave privada codificado en Base64 y `LEYTECH_ASSISTANT_PUBLIC_KEY` con la clave pública hexadecimal que incluiste en el instalador. La emisión se bloquea si las dos claves no corresponden.
4. Publica el MSI y el actualizador EXE en Vercel Blob, ambos con enlaces HTTPS de descarga. Desde el proyecto del asistente, genera el manifiesto firmado con `packaging/release.py manifest <exe> <url-exe> <salida> --windows-installer <msi> <url-msi>`. Guárdalo como `public/asistente-release.json`. La tienda ofrece el MSI y las versiones instaladas reciben el EXE compatible. Los binarios no se agregan a Git.
5. Verifica en una vista previa la descarga, el acceso con una cuenta de personal y la activación con el instalador asociado a la clave. Publica los cambios en el proyecto Vercel de Leytech cuando se apruebe la revisión.

Para una prueba local, coloca el instalador de revisión en `public/descargas/Leytech-Asistente-Windows-x64.exe` y usa esa ruta en `LEYTECH_ASSISTANT_DOWNLOAD_URL`. El ejecutable local queda excluido de Git y de la subida de Vercel.
