import fs from "node:fs";
if(process.env.LEYTECH_ENV_FILE)process.loadEnvFile(process.env.LEYTECH_ENV_FILE);
else if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
else if (fs.existsSync(".env")) process.loadEnvFile(".env");
