import './env';
import fs from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {db} from '../src/lib/db';
import {seed} from './seed';
import {settings} from '../src/lib/catalog';
import {hashPassword} from '../src/lib/security';
import {productionPolicies} from './production-policies';
async function main(){
 if(!process.env.DATABASE_URL)throw new Error('Falta la conexión de producción.');
 await seed(false);
 const current=await settings();
 await db.query("UPDATE settings SET value=$1 WHERE id='store'",[JSON.stringify({...current,orderChannel:'whatsapp',demoMode:false,salesEnabled:true,transferEnabled:false,policies:{...productionPolicies,...current.policies}})]);
 const count=Number((await db.query<{count:string}>('SELECT count(*) FROM products')).rows[0].count);
 if(count===0){await seed(true);await db.query("UPDATE products SET status='draft' WHERE is_demo=true");}
 const email=process.env.LEYTECH_OWNER_EMAIL?.trim().toLowerCase();
 if(!email)throw new Error('Define LEYTECH_OWNER_EMAIL para crear o verificar al propietario.');
 const exists=(await db.query('SELECT id FROM admins WHERE email=$1',[email])).rows.length;
 if(!exists){const password=randomBytes(24).toString('base64url');await db.query('INSERT INTO admins(id,email,password_hash,role) VALUES($1,$2,$3,$4)',[crypto.randomUUID(),email,hashPassword(password),'owner']);await fs.writeFile('.data/production-admin-access.txt',`Leytech · Acceso de propietario\nCorreo: ${email}\nContraseña inicial: ${password}\nCambia la contraseña en Configuración > Seguridad tras ingresar.\nEste archivo es privado y está excluido de GitHub.\n`);}
 console.log('Tienda configurada para ventas por WhatsApp. Políticas publicadas y productos de ejemplo conservados solo como borradores.');await db.close();
}
main().catch(e=>{console.error(e.message);process.exit(1);});
