import "./env";
import fs from "node:fs/promises";
import { db } from "../src/lib/db";
import { seed } from "./seed";
async function main() {
  const production=process.argv.includes('--production')||process.env.NODE_ENV==='production';
  if(!process.argv.includes('--data-only'))for(const file of (await fs.readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await fs.readFile(`migrations/${file}`,'utf8'));
  await seed(!production);
  console.log(
    production?'Configuración de producción creada. No se publicaron productos ni existencias ficticias.':'Migraciones aplicadas. Catálogo de ejemplo cargado sin reemplazar datos existentes.',
  );
  await db.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
