# Código del asistente incluido en este repositorio

El código de escritorio está en `asistente/`, separado de la aplicación web. Se copió de la versión de desarrollo conservando sus rutas internas. No se incluyeron ejecutables ni se cambió el enlace de descarga de la tienda. `.vercelignore` excluye esa carpeta del despliegue de la web.

## Funciones incluidas

- Atajo global de mostrar/minimizar con conservación de la barra de tareas y del tamaño normal de la ventana.
- Controles de música por teclado, detector de combinaciones y reconocimiento de teclas multimedia sin confundir Num Lock con Alt.
- Superposición con interacción mediante el ratón sin activar automáticamente la ventana. Pulsar la entrada de texto activa el teclado del asistente.
- Chat con visor nativo, copia de respuestas, lectura por líneas y conservación de la posición al desplazarse o restaurar la ventana.
- Avisos con logo y animaciones de entrada/salida para las respuestas y la canción reproduciéndose. Las dos variantes de «Buscando la canción» quedan excluidas.
- Reconocimiento que reúne los segmentos y espera dos segundos de silencio antes de enviar la orden, sin el antiguo corte fijo de ocho segundos.
- Modelos offline de español e inglés, relación de idiomas instalados y análisis del título en inglés manteniendo la activación y los comandos en español.
- Micrófono habilitado durante el saludo, con interrupción por palabra de activación, indicador de señal estable y sin anuncio de conexión al arrancar.
- Volúmenes de música y voz guardados; la reducción temporal de la música mientras habla el asistente no cambia el volumen permanente. Escrituras de ajustes protegidas y atómicas.
- Temas claro/oscuro, gestión de memoria de conversación, soporte por Discord y herramientas de empaquetado de la versión portable.

## Datos excluidos

No se copiaron configuración personal, historial, logs, entornos de Python, cachés, claves API, claves de firma, archivos de activación, recibos de licencia ni bases de datos locales. Tampoco se copiaron `activation-public.txt`, `activation-url.txt` ni `update-public.txt`. La validación de activación continúa en el código; no se eliminó ni se deshabilitó.

## Ejecutar desde el código

Usar Windows x64, Python compatible y los requisitos descritos en `asistente/README.md`. Desde `asistente/`, crear un entorno e instalar `requirements.txt`. Para música se necesita VLC x64 y un Node.js compatible; los modelos offline ya están incluidos. El equipo de Leytech debe proporcionar por separado la clave pública y la URL de activación de esta edición antes de ejecutar normalmente. La clave API de IA es opcional y debe introducirla cada usuario; los comandos offline no dependen de ella.

## Validación de esta entrega

Se verificaron la integridad de la copia, la sintaxis y las referencias internas de los módulos Python, las exclusiones de credenciales y las rutas de recursos. Sobre la copia entregada se probaron órdenes simuladas de 20 segundos que solo se envían tras el silencio, el guardado concurrente de volúmenes, el chat en ambos temas tras 40 restauraciones y la exclusión de avisos de búsqueda conservando el título de reproducción. También se comprueban los modelos instalados y las bibliotecas disponibles en este ordenador.

No se compiló esta entrega. Las pruebas locales no garantizan todos los equipos, auriculares, acentos, proveedores ni juegos. La escritura requiere cambiar el foco del teclado y los juegos en pantalla completa exclusiva pueden minimizarse o impedir una superposición; usar modo sin bordes para ese caso. La precisión real del reconocimiento debe validarse con micrófonos y ruido de los equipos de destino.

## Antes de actualizar a clientes

1. Revisar y aumentar `asistente/VERSION`: el código conserva `1.1.1`, igual que el origen; todavía no identifica una publicación nueva.
2. Preparar las claves públicas y direcciones de activación/actualización de la tienda fuera de Git. No empaquetar claves privadas, claves API personales ni recibos de activación de un cliente.
3. Preparar las dependencias de compilación indicadas en `asistente/packaging/PORTABLE.md` o `OPERACION.md`. La portable requiere los extras `default` de yt-dlp (incluido EJS), Node.js oficial x64 y su licencia, además de VLC x64.
4. Compilar y validar en una instalación limpia de Windows x64. Probar activación de un equipo nuevo, reconocimiento, reproducción, volúmenes, atajos, chat y cierre.
5. Publicar el binario y el manifiesto firmado apropiados y, después, actualizar el enlace de la tienda. La portable no debe sustituir directamente el actualizador MSI/EXE de los usuarios instalados.

Un commit de estos archivos no actualiza por sí solo el programa que descargan los clientes.
