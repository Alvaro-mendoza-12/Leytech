# Emitir y canjear una licencia de Leytech Asistente

1. Abre el panel de la tienda y selecciona **Licencias**. El propietario puede dar a cada operador su propia cuenta en **Configuración → Usuarios**.
2. Pulsa **Generar licencia**.
3. Usa **Copiar licencia** y envíala al comprador por WhatsApp.
4. El comprador abre el asistente, pega el código LT2 y pulsa **Activar** con Internet. A partir de ese momento, la instalación puede abrir sin conexión.

El panel muestra la fecha del primer canje. Si se pierde la respuesta durante la activación, la aplicación puede recuperar su propia activación al volver a intentar. Conserva la activación guardada al reinstalar en el mismo perfil de Windows. Los códigos de prueba anteriores que comienzan con LT1 se reemplazan por los códigos de un solo uso.

## Compilar el instalador

Con Python 3.12 x64, NSIS y WiX 3.14.1 instalados, instala las dependencias de packaging/requirements-windows.lock en .build-env. Pon WiX en `.release-build\wix3141` o pasa su ubicación con `-WixTools`. Actualiza `VERSION` y ejecuta:

    .\.build-env\Scripts\python.exe packaging\release.py public-key update-public.txt
    .\packaging\build.ps1 -PublicKey .\activation-public.txt -UpdatePublicKey .\update-public.txt -ActivationUrl https://leytech-ochre.vercel.app/api/assistant/redeem

Usa la clave pública del firmante Ed25519 configurado en la tienda. La clave privada se custodia fuera de la app. El instalador incluye el modelo de voz español. Las funciones de música necesitan VLC x64 e Internet y la IA opcional usa una clave propia.

Entrega el MSI a nuevos usuarios. Windows Installer registra el producto en **Aplicaciones instaladas**, y reemplaza la entrada y el desinstalador de las versiones anteriores. El actualizador EXE permite llegar al MSI desde versiones que esperan un EXE.

Revisa la firma Authenticode y el archivo SHA256. Sube los dos archivos a nuevas rutas de Vercel Blob y genera el manifiesto:

    .\.build-env\Scripts\python.exe packaging\release.py manifest entrega\instaladores\Leytech-Asistente-Windows-x64.exe URL_EXE asistente-release.json --windows-installer entrega\instaladores\Leytech-Asistente-Windows-x64.msi URL_MSI

Copia el manifiesto en `public/asistente-release.json` del repositorio de la tienda y publica ese cambio. La clave de actualización es independiente de la de licencias y queda protegida por el perfil de Windows que genera los lanzamientos. Usa la misma clave en las siguientes versiones para que las instalaciones anteriores reconozcan sus actualizaciones.
