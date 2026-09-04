import { Pool } from "pg";
import dotenv from "dotenv";

const envResult = dotenv.config({ path: ".env" });
if (envResult.error) {
  console.log("[DB Config] .env file not found, falling back to system environment variables");
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

console.log("[DB Config]", {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD ? "****" : "(not set)",
});

export default pool;