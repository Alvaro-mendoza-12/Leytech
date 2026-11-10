import "./env";
import { randomBytes } from "node:crypto";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/security";
async function main() {
  const email = process.argv[2]?.toLowerCase();
  if (!email || !email.includes("@"))
    throw new Error(
      "Uso: npm run admin:create -- correo@ejemplo.com. Genera contraseña aleatoria; se muestra una única vez.",
    );
  const password = randomBytes(18).toString("base64url");
  await db.query(
    "INSERT INTO admins(id,email,password_hash) VALUES($1,$2,$3)",
    [crypto.randomUUID(), email, hashPassword(password)],
  );
  console.log(
    `Administrador creado: ${email}\nContraseña temporal: ${password}\nCámbiala en Configuración > Seguridad al ingresar.`,
  );
  await db.close();
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
