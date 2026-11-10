import fs from "node:fs";
if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
else if (fs.existsSync(".env")) process.loadEnvFile(".env");
