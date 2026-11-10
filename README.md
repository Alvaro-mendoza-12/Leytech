# Leytech

Catálogo de tecnología y ventas por WhatsApp: **+51 905 886 853**.

- Tienda: https://leytech-ochre.vercel.app
- Panel: https://leytech-ochre.vercel.app/admin
- Repositorio: https://github.com/Alvaro-mendoza-12/Leytech

Publicada en Vercel con PostgreSQL y almacenamiento privado de Supabase. El modo demostración está desactivado. GitHub Pages redirige a la tienda; Next.js se ejecuta en Vercel.

## Administrar

El acceso inicial de producción está en el archivo local privado `.data/production-admin-access.txt`, excluido de GitHub. Cambia la contraseña en Configuración → Seguridad al ingresar.

1. En Catálogo → Productos puedes crear productos o editar los 12 borradores de ejemplo. Reemplaza fotos, descripción, precio, garantía y stock con los reales. Para publicar un ejemplo, confirma la revisión de sus datos en el paso Revisión y elige Publicar en la tienda.
2. Completa titular, RUC, dirección comercial y correo de atención en Configuración → Negocio. El propietario agregará estos datos desde el panel.
3. Configura logo, color, portada, categorías, inventario, WhatsApp y políticas desde el panel. Los cambios de contenido no requieren desplegar código.
4. El cliente añade productos al carrito y pulsa Comprar por WhatsApp. Se guarda un código y se prepara el mensaje; el cliente decide enviarlo. La solicitud no reserva stock ni confirma el pago.
5. Atiende Ventas → Solicitudes de WhatsApp. Después del acuerdo puedes registrar el pedido y la entrega. La reserva dura 30 minutos. Confirma manualmente el ingreso del pago, con evidencia, antes de preparar la entrega.

El pago, el costo de envío y el plazo se acuerdan por WhatsApp. La web no solicita tarjetas ni requiere una pasarela de pagos. Las licencias digitales se entregan manualmente.

La tienda y el panel comprueban cambios cada 10 segundos mientras la pestaña está visible. Al guardar productos, precios, stock o marca, la tienda abierta se actualiza sin recargar manualmente. Las solicitudes nuevas aparecen en el panel automáticamente. Cambia o restaura el logo desde **Configuración → Negocio**.

El propietario cargará su catálogo real. Los ejemplos siguen como borradores editables y no representan inventario a la venta.

## Desarrollo local

Usa Node.js 24 LTS. Las dependencias están fijadas en package-lock.json.

```powershell
npm ci
Copy-Item .env.example .env.local
npm run db:setup
npm run admin:create -- propietario@ejemplo.com
npm run dev
```

No reemplaces un entorno existente. NEXT_PUBLIC_SITE_URL debe coincidir con el origen local, incluido el puerto. La instalación local anterior usa http://localhost:3001 y PGlite en `.data/leytech`; es independiente de producción. Detén su servidor antes de operar sobre esa base con scripts.

```powershell
npm run typecheck
npm test
npm run build
```

Las pruebas HTTP generan datos ficticios y solo funcionan en modo demostración. No las ejecutes contra producción.

Consulta [despliegue y variables](docs/DESPLIEGUE.md), [verificaciones y límites](docs/ENTREGA.md) y [arquitectura](docs/ARQUITECTURA.md). Los secretos y archivos locales están excluidos de Git y de las cargas de despliegue.
