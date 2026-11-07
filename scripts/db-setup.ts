import { db, SCHEMA } from "../lib/db";

(async () => {
  await db().query(SCHEMA);
  console.log("schema ready");
  await db().end();
})();
