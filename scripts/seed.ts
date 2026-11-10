import { db } from "../src/lib/db";
import { slugify } from "../src/lib/format";
import type { StoreSettings } from "../src/lib/types";
export async function seed(demo=true) {
  const config: StoreSettings = {
    orderChannel:'whatsapp',
    primaryColor: "#2563eb",
    logoUrl: "",
    heroImage: "/images/hero.jpg",
    name: "Leytech",
    whatsapp: "51905886853",
    tagline: "Tecnología que va contigo.",
    demoMode: demo,
    salesEnabled: false,
    legalName: "",
    ruc: "",
    address: "",
    email: "",
    transferEnabled: false,
    transferInstructions: "",
    shippingEnabled: false,
    shippingFee: 1500,
    shippingZone: "",
    pickupEnabled: false,
    pickupInstructions: "",
    heroTitle: "Dale un upgrade a tu día.",
    heroSubtitle:
      "Encuentra ese accesorio que hace la diferencia. Para trabajar, jugar y disfrutar a tu manera.",
    policies: {},
  };
  await db.query(
    "INSERT INTO settings(id,value) VALUES('store',$1) ON CONFLICT DO NOTHING",
    [JSON.stringify(config)],
  );
  const cats = [
    ["perifericos", "Teclados y mouse", "Keyboard"],
    ["audio", "Audífonos y audio", "Headphones"],
    ["accesorios", "Accesorios de cómputo", "Monitor"],
    ["almacenamiento", "Componentes y almacenamiento", "HardDrive"],
    ["redes", "Redes y conectividad", "Wifi"],
    ["gaming", "Gaming", "Gamepad2"],
    ["software", "Software y licencias", "AppWindow"],
  ];
  for (const [id, name, icon] of cats)
    await db.query(
      "INSERT INTO categories(id,name,slug,icon) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
      [id, name, id, icon],
    );
  if(!demo)return;
  const items = [
    [
      "Audífonos inalámbricos Studio",
      "Leytech Select",
      "audio",
      24990,
      "audio.jpg",
      "Sonido envolvente. Cero distracciones.",
      "Conexión Bluetooth, diseño circumaural y controles integrados para acompañar tus sesiones de música.",
      {
        Conectividad: "Bluetooth 5.3",
        Autonomía: "Hasta 30 horas",
        "Conector de carga": "USB-C",
      },
    ],
    [
      "Teclado mecánico K68 RGB",
      "Leytech Select",
      "perifericos",
      18990,
      "keyboard.jpg",
      "Tu escritorio, a otro nivel.",
      "Formato compacto, teclas mecánicas e iluminación ajustable para trabajo y juego.",
      { Distribución: "Español", Formato: "68 teclas", Conexión: "USB-C" },
    ],
    [
      "Mouse inalámbrico Precision",
      "Leytech Select",
      "perifericos",
      8990,
      "mouse.jpg",
      "Precisión en cada movimiento.",
      "Mouse ergonómico con conexión inalámbrica y sensibilidad ajustable.",
      { Sensor: "Óptico", Conectividad: "2.4 GHz", DPI: "Hasta 3200" },
    ],
    [
      "Control inalámbrico Play",
      "Leytech Select",
      "gaming",
      15990,
      "controller.jpg",
      "Todo listo para la próxima partida.",
      "Control con empuñaduras ergonómicas y conexión inalámbrica para PC.",
      { Compatibilidad: "Windows", Conectividad: "Bluetooth", Carga: "USB-C" },
    ],
    [
      "SSD portátil Pocket 1 TB",
      "Leytech Select",
      "almacenamiento",
      29990,
      "storage.jpg",
      "Tus archivos, siempre contigo.",
      "Almacenamiento compacto para llevar tus proyectos y respaldos.",
      { Capacidad: "1 TB", Interfaz: "USB 3.2", Tipo: "SSD externo" },
    ],
    [
      "Hub USB-C Connect 6 en 1",
      "Leytech Select",
      "accesorios",
      12990,
      "hub.jpg",
      "Más conexiones, menos límites.",
      "Expande la conectividad de tu laptop desde un solo puerto USB-C.",
      {
        Puertos: "HDMI, USB-A, USB-C, SD",
        Video: "Hasta 4K a 30 Hz",
        Alimentación: "USB-C PD",
      },
    ],
    [
      "Parlante Bluetooth Move",
      "Leytech Select",
      "audio",
      11990,
      "speaker.jpg",
      "Lleva tu música a todas partes.",
      "Parlante portátil con conexión Bluetooth para tu espacio de trabajo.",
      {
        Conectividad: "Bluetooth",
        Autonomía: "Hasta 12 horas",
        Carga: "USB-C",
      },
    ],
    [
      "Router Wi-Fi Dual Band",
      "Leytech Select",
      "redes",
      17990,
      "router.jpg",
      "Conecta cada rincón.",
      "Router de doble banda para tu red doméstica.",
      {
        Bandas: "2.4 y 5 GHz",
        Estándar: "Wi-Fi 5",
        Puertos: "Gigabit Ethernet",
      },
    ],
    [
      "Monitor Full HD 24 pulgadas",
      "Leytech Select",
      "accesorios",
      59990,
      "monitor.jpg",
      "Espacio para tus ideas.",
      "Pantalla de 24 pulgadas con panel IPS y conexiones para tu escritorio.",
      { Resolución: "1920 × 1080", Panel: "IPS", Conectividad: "HDMI" },
    ],
    [
      "Mousepad Desk XL",
      "Leytech Select",
      "gaming",
      4990,
      "desk.jpg",
      "Un lugar para cada movimiento.",
      "Superficie amplia con base antideslizante para teclado y mouse.",
      {
        Dimensiones: "80 × 30 cm",
        Base: "Goma antideslizante",
        Superficie: "Tela",
      },
    ],
    [
      "Licencia de software · ejemplo",
      "Catálogo digital",
      "software",
      9990,
      "software.jpg",
      "Entrega digital gestionada por Leytech.",
      "Producto de demostración. Reemplazar por una licencia legítima y documentar autorización de reventa antes de publicarlo.",
      {
        "Tipo de licencia": "Por configurar",
        Duración: "Por configurar",
        Activación: "Entrega manual tras verificar pago",
      },
    ],
    [
      "Audífonos Essential con micrófono",
      "Leytech Select",
      "audio",
      7990,
      "earbuds.jpg",
      "Llamadas claras, a tu ritmo.",
      "Audífonos compactos con micrófono integrado para el día a día.",
      { Conectividad: "Bluetooth", Formato: "In-ear", Carga: "USB-C" },
    ],
  ] as const;
  for (let i = 0; i < items.length; i++) {
    const [
      name,
      brand,
      category,
      price,
      image,
      summary,
      description,
      specifications,
    ] = items[i];
    const id = `demo-${i + 1}`;
    await db.query(
      `INSERT INTO products(id,slug,name,brand,category_id,summary,description,specifications,images,status,type,warranty,featured,is_demo) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true) ON CONFLICT DO NOTHING`,
      [
        id,
        slugify(name),
        name,
        brand,
        category,
        summary,
        description,
        JSON.stringify(specifications),
        JSON.stringify([`/images/${image}`]),
        category === "software" ? "draft" : "published",
        category === "software" ? "digital" : "physical",
        "Condiciones de garantía por confirmar con Leytech.",
        i < 6,
      ],
    );
    const colors =
      i < 3
        ? [
            ["Negro", "#242933", 8],
            ["Blanco", "#E9EBEF", 5],
            ["Azul", "#2563EB", 0],
          ]
        : [["Estándar", "#242933", 6]];
    for (let j = 0; j < colors.length; j++) {
      const [color, hex, stock] = colors[j];
      await db.query(
        `INSERT INTO variants(id,product_id,sku,name,color,color_hex,price,compare_at,stock) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
        [
          `${id}-v${j + 1}`,
          id,
          `LT-${String(i + 1).padStart(3, "0")}-${j + 1}`,
          color,
          i < 3 ? color : "",
          hex,
          price,
          null,
          stock,
        ],
      );
    }
  }
}
