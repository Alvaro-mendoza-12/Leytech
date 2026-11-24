# Leytech Asistente

Asistente de escritorio para Windows enfocado en usuarios gamer con auriculares. Incluye conversación casual, comandos de voz y reproducción de música integrada. La interfaz y la lógica funcionan dentro del mismo proceso Python, sin servidor local ni navegador para reproducir canciones.

## Requisitos para desarrollar

- Windows 10/11 de 64 bits y Python 3.10–3.13 con Tkinter.
- Auriculares reconocidos por Windows; micrófono para las órdenes de voz.
- VLC 3.x de la misma arquitectura que Python.
- Node.js compatible con yt-dlp para resolver las canciones de YouTube.
- Clave pública de activación y URL de canje proporcionadas por Leytech, en `activation-public.txt` y `activation-url.txt`. No incluir claves privadas en el repositorio.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m backend.setup_voice_model
.\.venv\Scripts\python.exe -m frontend.gui
```

El modelo de reconocimiento español se descarga con el tercer comando; después puede utilizarse sin Internet. La primera activación requiere conexión. La licencia guardada se verifica para cada equipo.

## Funciones

- Reconocimiento offline y online; palabra de activación configurable.
- Respuestas de voz con las voces compatibles de Windows.
- Música con yt-dlp y VLC: búsqueda, reproducción, pausa, desplazamiento y canciones similares. Requiere Internet.
- IA opcional con OpenAI u OpenRouter; sin clave, los comandos locales siguen disponibles.
- Temas claro y oscuro, historial de chat y exportación, importación o borrado de memoria.
- Soporte mediante el botón de Discord de los ajustes.

Las instrucciones internas de la IA están en `.assistant_prompt.txt`. Los ajustes del código fuente se guardan en `config/config.json` y las conversaciones en `logs/chat_history.txt`. Esos datos, las claves API y los comprobantes de activación no se versionan.

La versión instalada usa `%LOCALAPPDATA%\Leytech\Asistente`. La portable mantiene sus ajustes e historial en la subcarpeta `portable`; la licencia del equipo se conserva por separado. Los ajustes exportados pueden contener claves API y no deben publicarse.

## Estructura

- `backend/`: voz, comandos, música, memoria y activación.
- `frontend/`: interfaz Tkinter y recursos gráficos.
- `packaging/`: herramientas de compilación, distribución y avisos de terceros.

La carpeta `backend` contiene la lógica interna de la aplicación; no es un servicio separado.

## Compilar y distribuir

- Portable de un solo archivo: [guía portable](packaging/PORTABLE.md).
- Instalador MSI y actualizador EXE: [operación y publicación](packaging/OPERACION.md).

Las compilaciones quedan en `entrega/`, excluida de Git. El instalador se genera en `entrega/instaladores/`. No se publica ninguna web desde este repositorio. Para cambiar la descarga de la tienda, primero se sube el binario y después se actualiza su enlace en el repositorio de la web. Hacer un commit del código no reemplaza el programa descargable.

## Atajos de teclado

En Ajustes → Atajos de teclado puedes modificar o desactivar las combinaciones globales. Se aplican al guardar y reiniciar; si otra aplicación ocupa una combinación, elige otra. Los controles de música no restauran la ventana ni cambian el volumen del escritorio.

| Acción | Predeterminado |
| --- | --- |
| Mostrar / minimizar asistente | Ctrl+Alt+L |
| Pausar / reanudar canción | Ctrl+Alt+P |
| Retroceder / adelantar 10 segundos | Ctrl+Alt+Left / Ctrl+Alt+Right |
| Canción anterior / siguiente | Ctrl+Alt+B / Ctrl+Alt+N |

Cuando comienza una canción con el asistente minimizado, un aviso con el logo y el título entra desde la izquierda y se retira hacia la izquierda tras seis segundos. No activa la ventana principal. Algunas aplicaciones o juegos pueden reservar teclas o impedir avisos sobre su pantalla completa exclusiva.

## Reconocimiento de títulos en inglés

En Ajustes → Micrófono y reconocimiento se muestran los modelos instalados de español e inglés. La opción «Reconocer también títulos de canciones en inglés» compara el audio del título con el modelo inglés manteniendo la palabra de activación y «reproduce» en español. Funciona tanto en offline como en online; no cambia las voces de Windows. Si el resultado inglés no tiene suficiente confianza, se conserva el original. No se garantiza reconocer correctamente todos los nombres propios o acentos.

Para instalar el modelo inglés en una copia nueva del código:

```powershell
python -m backend.setup_voice_model --language en-US
```

El empaquetado incluye ambos modelos. Las órdenes encadenadas mantienen el reconocimiento original para no alterar los comandos en español.

### Interacción sobre otras aplicaciones

Al mostrar el asistente con el atajo, los controles de ratón conservan el foco de la aplicación que está detrás. Los ajustes abiertos desde esa superposición tampoco usan un bloqueo modal. El teclado continúa dirigido a la aplicación de fondo: escribir texto o grabar un atajo requiere activar el asistente. Para cambiar de foco sin minimizar un juego, usa el modo ventana sin bordes; la pantalla completa exclusiva puede impedir la superposición.

El atajo de mostrar/minimizar utiliza minimización nativa de Windows: conserva el botón en la barra de tareas y restaura el tamaño normal guardado. No oculta la aplicación mediante withdraw.

Las respuestas del asistente se notifican por turnos cuando está minimizado. El indicador de micrófono mantiene el estado durante pausas breves y solo señala ausencia de audio tras ocho segundos de señal nula. Al iniciar, el micrófono habilitado escucha durante el saludo; no se anuncia el estado inicial de Internet, pero se conservan los avisos de pérdida y recuperación posteriores.

Las secciones de ajustes usan texto sin iconos. El chat muestra el inicio del mensaje nuevo al seguir la conversación, pero conserva la posición al desplazarse manualmente y al restaurar la ventana. La rueda y la barra lateral comparten el mismo control de desplazamiento.

El chat usa un visor de texto nativo, con copia de respuestas y desplazamiento por líneas, sin ventanas incrustadas por mensaje. El reconocimiento espera dos segundos de silencio; los segmentos internos se reúnen antes de enviar una orden, sin el antiguo corte fijo de ocho segundos. El volumen de música y de voz se guarda en ajustes; la reducción temporal de música mientras habla el asistente no modifica el volumen guardado.
