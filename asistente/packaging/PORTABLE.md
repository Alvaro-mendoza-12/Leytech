# Portable de Leytech

Entrega: entrega/Leytech-Asistente-Portable.exe. Distribuir solamente ese archivo.

Compatible con Windows 10/11 de 64 bits. Incluye Python, reconocimiento offline en español, VLC, yt-dlp y el motor JavaScript necesario para YouTube. No requiere instalarlos aparte. Las voces dependen de las voces compatibles disponibles en Windows. Necesita auriculares reconocidos por el sistema y la activación correspondiente en cada equipo. Las funciones de Internet requieren conexión; la IA requiere una clave opcional del usuario.

El ejecutable no contiene ajustes personales, historial, claves API ni una licencia activada. Al primer inicio usa los valores predeterminados: tema claro, reconocimiento offline y claves vacías. Los datos nuevos se guardan en %LOCALAPPDATA%/Leytech/Asistente/portable, separados de la versión instalada. La licencia existente no se borra.

Es un solo archivo para distribuir, pero al ejecutarse extrae sus componentes temporalmente. No constituye protección contra extracción o modificación por terceros. Para actualizarlo se reemplaza el ejecutable completo.

Validación realizada: recursos incluidos; carga del reconocimiento de voz y voces de Windows; reproducción, pausa, avance y volumen con VLC; exportación e importación de memoria; resolución de audio de YouTube. El ejecutable pasó las comprobaciones sin rutas externas de Python, Node o VLC. No se ha probado físicamente en otro ordenador y no se garantiza compatibilidad universal.

## Volver a compilar

En un entorno de Python de 64 bits con los requisitos del proyecto, instalar PyInstaller y los extras default de yt-dlp (incluye yt-dlp-ejs). Usar una versión oficial de Node.js de 64 bits y una instalación VLC de 64 bits:

    python packaging/build_portable.py --node C:/ruta/node.exe --node-license C:/ruta/LICENSE-node.txt

El proceso incorpora el modelo offline y los recursos, genera los avisos de terceros y verifica el resultado. No incorpora config, logs o comprobantes de activación. El resumen de versiones y hash queda en .portable-build/build-info.json.
