import "./env";
import fs from "node:fs/promises";
import { db } from "../src/lib/db";
import { seed } from "./seed";
async function main() {
  await db.exec(await fs.readFile("migrations/001_initial.sql", "utf8"));
  await seed();
  console.log(
    "Migración 001 aplicada. Catálogo de ejemplo cargado sin reemplazar datos existentes.",
  );
  await db.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
