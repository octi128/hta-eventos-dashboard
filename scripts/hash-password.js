// Uso: node scripts/hash-password.js "contraseña"  → imprime el valor para DASHBOARD_USERS
import { hashPassword } from "../lib/auth.js";
if (!process.argv[2]) { console.error('Uso: node scripts/hash-password.js "contraseña"'); process.exit(1); }
console.log(hashPassword(process.argv[2]));
