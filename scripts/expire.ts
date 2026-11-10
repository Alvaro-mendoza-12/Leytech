import "./env";
import { expireOrders } from "../src/lib/commerce";
import { db } from "../src/lib/db";
expireOrders()
  .then(() => db.close())
  .then(() => console.log("Reservas vencidas liberadas."))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
