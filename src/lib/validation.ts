import { z } from "zod";
const text = (max: number) => z.string().trim().max(max);
export const cartSchema = z.object({
  items: z
    .array(
      z.object({
        variantId: text(100).min(1),
        quantity: z.number().int().min(1).max(99),
        price: z.number().int().positive().optional(),
      }),
    )
    .min(1, "Agrega un producto al carrito.")
    .max(60),
});
export const checkoutSchema = cartSchema.extend({
  idempotencyKey: z.uuid(),
  customer: z.object({
    name: text(100).min(3),
    email: z.union([z.literal(''),z.email().max(150)]),
    phone: z.string().regex(/^\+?[0-9 ()-]{9,18}$/),
    delivery: z.enum(["shipping", "pickup", "digital", "coordinate"]),
    address: text(250).default(""),
    district: text(100).default(""),
  }),
  method: z.enum(["coordinate", "transfer", "mercadopago"]),
  consent: z.literal(true),
});
export const productSchema = z
  .object({
    id: text(100).optional(),
    confirmRealProduct: z.boolean().default(false),
    name: text(160).min(3),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(180),
    brand: text(80).min(1),
    category_id: text(100).min(1),
    summary: text(250),
    description: text(10000),
    specifications: z.record(text(100), text(500)),
    images: z
      .array(z.string().regex(/^\/(images|uploads|media)\/[a-zA-Z0-9._-]+$/))
      .max(8),
    status: z.enum(["draft", "published", "archived"]),
    type: z.enum(["physical", "digital"]),
    warranty: text(1000),
    featured: z.boolean(),
    seo_title: text(160).default(""),
    seo_description: text(300).default(""),
    variants: z
      .array(
        z
          .object({
            id: text(100).optional(),
            sku: text(100).min(1),
            name: text(100).min(1),
            color: text(50),
            color_hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
            attributes: z.record(text(100), text(200)).default({}),
            image: z
              .union([
                z.literal(""),
                z.string().regex(/^\/(images|uploads|media)\/[a-zA-Z0-9._-]+$/),
              ])
              .default(""),
            price: z.number().int().positive().max(100000000),
            compare_at: z.number().int().positive().nullable(),
            stock: z.number().int().nonnegative().max(1000000),
            active: z.boolean().default(true),
          })
          .refine(
            (v) => v.compare_at === null || v.compare_at > v.price,
            "El precio anterior debe ser mayor que el precio actual.",
          ),
      )
      .min(1)
      .max(50),
  })
  .refine(
    (p) => new Set(p.variants.map((v) => v.sku)).size === p.variants.length,
    "Los SKU de las variantes deben ser únicos.",
  );
export const settingsSchema = z
  .object({
    orderChannel: z.enum(['whatsapp','online']).default('whatsapp'),
    primaryColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .refine((value) => {
        const rgb = [1, 3, 5]
          .map((i) => parseInt(value.slice(i, i + 2), 16) / 255)
          .map((c) =>
            c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
          );
        const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
        return 1.05 / (luminance + 0.05) >= 4.5;
      }, "Elige un color principal más oscuro para mantener legibles los botones con texto blanco.")
      .default("#2563eb"),
    logoUrl: z
      .union([
        z.literal(""),
        z.string().regex(/^\/(images|uploads|media)\/[a-zA-Z0-9._-]+$/),
      ])
      .default(""),
    heroImage: z
      .string()
      .regex(/^\/(images|uploads|media)\/[a-zA-Z0-9._-]+$/)
      .default("/images/hero.jpg"),
    name: text(80).min(2),
    whatsapp: z.string().regex(/^[1-9][0-9]{7,14}$/),
    tagline: text(160),
    demoMode: z.boolean(),
    showSamples: z.boolean().default(true),
    salesEnabled: z.boolean(),
    legalName: text(160),
    ruc: z.union([z.literal(""), z.string().regex(/^\d{11}$/)]),
    address: text(250),
    email: z.union([z.literal(""), z.email().max(150)]),
    transferEnabled: z.boolean(),
    transferInstructions: text(2000),
    shippingEnabled: z.boolean(),
    shippingFee: z.number().int().nonnegative().max(1000000),
    shippingZone: text(250),
    pickupEnabled: z.boolean(),
    pickupInstructions: text(500),
    heroTitle: text(100).min(3),
    heroSubtitle: text(300),
    policies: z.record(text(50), text(20000)),
  })
  .refine(
    (s) => !s.transferEnabled || s.transferInstructions.length >= 10,
    "Completa las instrucciones de transferencia.",
  )
  .refine(
    (s) => !s.shippingEnabled || s.shippingZone.length >= 3,
    "Define la cobertura de envío.",
  )
  .refine(
    (s) => !s.pickupEnabled || s.pickupInstructions.length >= 5,
    "Define la dirección e instrucciones de recojo.",
  )
  .refine(
    (s) =>
      !s.salesEnabled ||
      s.orderChannel==='whatsapp' ||
      s.demoMode ||
      (s.legalName.length > 2 &&
        s.ruc.length === 11 &&
        s.address.length > 5 &&
        s.email.length > 3 &&
        ["terminos", "privacidad", "garantias", "envios"].every(
          (k) => (s.policies[k] || "").length > 50,
        )),
    "Para habilitar ventas reales, completa los datos fiscales, contacto y políticas.",
  );
export const claimSchema = z.object({
  name: text(150).min(3),
  email: z.email().max(150),
  phone: text(30).min(9),
  document: text(20).min(8),
  address: text(250).min(5),
  type: z.enum(["reclamo", "queja"]),
  description: text(5000).min(15),
  request: text(3000).min(10),
  consent: z.literal(true),
});
export const whatsappOrderSchema=z.object({quoteId:z.uuid(),name:text(100).min(3),phone:z.string().regex(/^\+?[0-9 ()-]{9,18}$/),email:z.union([z.literal(''),z.email().max(150)]).default(''),delivery:z.enum(['shipping','pickup','digital']),address:text(250).default(''),district:text(100).default(''),shippingFee:z.number().int().nonnegative().max(1000000),agreement:text(1000).min(10)}).refine(d=>d.delivery==='shipping'||d.shippingFee===0,'Solo un envío físico puede tener costo de entrega.').refine(d=>d.delivery!=='shipping'||d.address.length>=5,'Completa la dirección acordada con el cliente.');
