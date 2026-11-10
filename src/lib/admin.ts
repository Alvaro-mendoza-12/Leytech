import { db } from "./db";
import { audit, AppError } from "./security";
import { productSchema } from "./validation";
import type { Variant, Admin, Order } from "./types";
import { commitStock, releaseReservation } from "./commerce";
export async function saveProduct(input: unknown, admin: Admin) {
  const p = productSchema.parse(input);
  const id = p.id || crypto.randomUUID();
  return db.transaction(async (tx) => {
    const existing = (await tx.query<{id:string;is_demo:boolean}>("SELECT id,is_demo FROM products WHERE id=$1 FOR UPDATE", [id])).rows[0];
    const exists = !!existing;
    if(existing?.is_demo && p.status==='published' && !p.confirmRealProduct) throw new AppError('Confirma que revisaste los datos reales antes de publicar este ejemplo.');
    const category = (
      await tx.query("SELECT id FROM categories WHERE id=$1", [p.category_id])
    ).rows[0];
    if (!category) throw new AppError("Selecciona una categoría válida.");
    const variants = (
      await tx.query<Variant>(
        "SELECT * FROM variants WHERE product_id=$1 ORDER BY id FOR UPDATE",
        [id],
      )
    ).rows;
    const missing = variants.filter(
      (v) => !p.variants.some((n) => n.id === v.id),
    );
    if (missing.some((v) => v.reserved > 0))
      throw new AppError(
        "Hay variantes con reservas. Consérvalas hasta finalizar los pedidos.",
      );
    if (exists)
      await tx.query(
        `UPDATE products SET name=$1,slug=$2,brand=$3,category_id=$4,summary=$5,description=$6,specifications=$7,images=$8,status=$9,type=$10,warranty=$11,featured=$12,seo_title=$13,seo_description=$14,updated_at=now() WHERE id=$15`,
        [
          p.name,
          p.slug,
          p.brand,
          p.category_id,
          p.summary,
          p.description,
          JSON.stringify(p.specifications),
          JSON.stringify(p.images),
          p.status,
          p.type,
          p.warranty,
          p.featured,
          p.seo_title,
          p.seo_description,
          id,
        ],
      );
    else
      await tx.query(
        `INSERT INTO products(id,name,slug,brand,category_id,summary,description,specifications,images,status,type,warranty,featured,seo_title,seo_description) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          id,
          p.name,
          p.slug,
          p.brand,
          p.category_id,
          p.summary,
          p.description,
          JSON.stringify(p.specifications),
          JSON.stringify(p.images),
          p.status,
          p.type,
          p.warranty,
          p.featured,
          p.seo_title,
          p.seo_description,
        ],
      );
    if(existing?.is_demo && p.confirmRealProduct) await tx.query('UPDATE products SET is_demo=false WHERE id=$1',[id]);
    for (const v of missing)
      await tx.query("UPDATE variants SET active=false WHERE id=$1", [v.id]);
    for (const v of p.variants) {
      const previous = variants.find((x) => x.id === v.id);
      if (v.id && !previous)
        throw new AppError("La variante no pertenece a este producto.");
      const variantId = previous?.id || crypto.randomUUID();
      if (v.stock < (previous?.reserved || 0))
        throw new AppError(
          "El stock no puede ser menor que las unidades reservadas.",
        );
      if (previous)
        await tx.query(
          "UPDATE variants SET sku=$1,name=$2,color=$3,color_hex=$4,attributes=$5,image=$6,price=$7,compare_at=$8,stock=$9,active=$10 WHERE id=$11",
          [
            v.sku,
            v.name,
            v.color,
            v.color_hex,
            JSON.stringify(v.attributes),
            v.image,
            v.price,
            v.compare_at,
            v.stock,
            v.active,
            variantId,
          ],
        );
      else
        await tx.query(
          "INSERT INTO variants(id,product_id,sku,name,color,color_hex,attributes,image,price,compare_at,stock,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
          [
            variantId,
            id,
            v.sku,
            v.name,
            v.color,
            v.color_hex,
            JSON.stringify(v.attributes),
            v.image,
            v.price,
            v.compare_at,
            v.stock,
            v.active,
          ],
        );
      const delta = v.stock - (previous?.stock || 0);
      if (delta)
        await tx.query(
          "INSERT INTO stock_movements(id,variant_id,delta,reason,admin_id) VALUES($1,$2,$3,$4,$5)",
          [
            crypto.randomUUID(),
            variantId,
            delta,
            exists ? "Ajuste desde edición de producto" : "Inventario inicial",
            admin.id,
          ],
        );
    }
    await audit(
      admin.id,
      exists ? "product.updated" : "product.created",
      id,
      { name: p.name, status: p.status },
      tx,
    );
    return { id };
  });
}
export async function updateOrder(
  id: string,
  action: string,
  reason: string,
  admin: Admin,
) {
  return db.transaction(async (tx) => {
    const order = (
      await tx.query<Order>("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!order) throw new AppError("Pedido no encontrado.", 404);
    if (action === "paid") {
      if (order.method === "mercadopago")
        throw new AppError(
          "Mercado Pago solo se confirma mediante notificación verificada.",
        );
      if (
        order.status !== "pending" ||
        new Date(order.expires_at).getTime() <= Date.now()
      )
        throw new AppError("El pedido no tiene una reserva vigente.");
      if (reason.length < 10)
        throw new AppError("Describe cómo verificaste el ingreso del pago.");
      await commitStock(order, tx, admin.id);
    } else if (action === "cancelled") {
      if (order.status !== "pending")
        throw new AppError("Solo se pueden cancelar pedidos pendientes.");
      await releaseReservation(id, tx);
      await tx.query(
        "UPDATE orders SET status='cancelled',updated_at=now() WHERE id=$1",
        [id],
      );
    } else if (["preparing", "shipped", "delivered"].includes(action)) {
      if (order.status !== "paid")
        throw new AppError("Confirma el pago antes de preparar la entrega.");
      await tx.query(
        "UPDATE orders SET fulfillment=$1,updated_at=now() WHERE id=$2",
        [action, id],
      );
    } else throw new AppError("Acción no disponible.");
    await audit(admin.id, `order.${action}`, id, { reason }, tx);
  });
}
