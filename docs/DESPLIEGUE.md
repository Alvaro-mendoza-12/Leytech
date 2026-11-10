# Despliegue y operación

## Producción

Tienda: https://leytech-ochre.vercel.app. Panel: https://leytech-ochre.vercel.app/admin.

Vercel: proyecto leytech, equipo alvaro-s-projects1, repositorio Alvaro-mendoza-12/Leytech. Next.js usa Node.js 24 LTS y funciones de servidor. GitHub Pages redirige a Vercel mediante index.html.

El equipo está en Hobby para la revisión del sitio. Antes de operar comercialmente, usa un plan de alojamiento que lo permita. [Condiciones de uso comercial en Vercel](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage).

Supabase: proyecto ujbocvvxyrvtbmxntmmm. Se usa el pooler transaccional con una cuenta técnica limitada a las tablas de Leytech, sin superusuario ni permisos para crear bases o roles. TLS valida certificado y nombre del servidor con la CA oficial de Supabase.

Las migraciones 001, 002 y 003 están aplicadas. Las 16 tablas tienen RLS y los roles públicos anon/authenticated no tienen acceso. El navegador se comunica con Next.js, que valida sesión, rol, origen, contenido e inventario.

Las fotografías se guardan en el bucket privado leytech-products. La aplicación admite JPEG, PNG y WebP hasta 4 MB. Las rutas /media sirven imágenes del catálogo sin exponer claves. El disco efímero de Vercel no guarda las subidas.

## Variables privadas

| Variable | Uso |
| --- | --- |
| DATABASE_URL | Cuenta técnica y pooler PostgreSQL |
| DATABASE_SSL | true en producción |
| DATABASE_CA_CERT_BASE64 | Certificado raíz oficial de Supabase en Base64 |
| DATABASE_POOL_MAX | 1 por instancia |
| STORAGE_SUPABASE_URL | URL HTTPS del proyecto |
| SUPABASE_SECRET_KEY | Clave privada de Storage, exclusiva del servidor |
| STORAGE_BUCKET | leytech-products |
| TRUST_PROXY | false; Vercel se reconoce por su variable de sistema y reescribe la cabecera de IP |

El origen público se obtiene de VERCEL_PROJECT_PRODUCTION_URL y también se acepta el origen del despliegue específico de Vercel. Si se usa un dominio propio fuera de esa configuración, define NEXT_PUBLIC_SITE_URL con su origen HTTPS exacto. Ningún secreto debe llevar el prefijo NEXT_PUBLIC_.

Los valores están guardados como variables sensibles de producción en Vercel. La copia local privada está en `.data/production.env`. Los previews no reciben automáticamente la conexión de producción.

## Actualizaciones

Los productos, precios, fotos, inventario y políticas se editan en /admin. Los cambios de código se publican mediante el repositorio conectado o con `vercel deploy --prod --scope alvaro-s-projects1` desde esta instalación vinculada.

Antes de publicar código ejecuta TypeScript, pruebas y compilación. Aplica las nuevas migraciones desde mantenimiento, después de revisarlas. El usuario técnico no es propietario del esquema y no ejecuta migraciones al arrancar.

Los scripts prepare-supabase, configure-storage e initialize-production sirven para el aprovisionamiento inicial. La inicialización lee el correo del propietario desde LEYTECH_OWNER_EMAIL en el entorno de mantenimiento y conserva las contraseñas y borradores existentes.

## Ventas y atención

El canal es WhatsApp; no hacen falta Mercado Pago ni otra pasarela. El código legado de pagos en línea está fuera del flujo configurado y no tiene credenciales de producción.

El catálogo y el carrito se usan sin cuenta. La solicitud se guarda con un código para identificarla en WhatsApp. El panel gestiona estados de atención. La compra, el pago y la entrega se acuerdan en WhatsApp.

El Libro guarda solicitudes e imprime constancias. No envía correos automáticamente. El propietario completará titular/RUC y demás datos desde el panel y debe revisar los requisitos aplicables. Las políticas iniciales son editables; no equivalen a una validación legal independiente.

## Respaldos y acceso

El acceso inicial está en `.data/production-admin-access.txt`. El cambio de contraseña revoca las sesiones. No hay recuperación automática por email ni MFA en el panel: conserva un acceso seguro.

Verifica respaldos y retención del plan contratado en Supabase. La copia SQL no incluye los objetos de Storage; respalda ambos por sus canales adecuados. Prueba la restauración en una base separada. No se declara una restauración ya validada.

El panel carga hasta 1000 productos, 200 solicitudes y 100 eventos recientes. Sus indicadores no sustituyen la contabilidad ni la facturación electrónica. Para mayor volumen añade paginación, agregaciones y monitoreo.

Referencias: [PostgreSQL de Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres), [Storage privado](https://supabase.com/docs/guides/storage/serving/downloads), [Node.js en Vercel](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).
