import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
await fs.mkdir('.data',{recursive:true});
let access;
try { access=JSON.parse(await fs.readFile('.data/supabase-access.json','utf8')); }
catch { access={project:'ujbocvvxyrvtbmxntmmm',username:`leytech_web_${randomBytes(3).toString('hex')}`,password:randomBytes(32).toString('base64url'),host:'aws-1-us-east-2.pooler.supabase.com',port:6543};await fs.writeFile('.data/supabase-access.json',JSON.stringify(access,null,2)); }
if(!/^[a-z0-9_]+$/.test(access.username)||!/^[A-Za-z0-9_-]+$/.test(access.password))throw new Error('Credencial local no válida.');
const names=['schema_migrations','settings','categories','products','variants','admins','sessions','rate_limits','quotes','orders','order_items','payments','payment_events','stock_movements','audit_log','claims'];
const schema=await fs.readFile('migrations/001_initial.sql','utf8');
const updates=await fs.readFile('migrations/002_whatsapp_orders.sql','utf8');
const privacy=await fs.readFile('migrations/003_private_tables.sql','utf8');
const role=access.username;
const permissions=names.map(name=>`ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY;\nREVOKE ALL ON public.${name} FROM anon, authenticated;\nDROP POLICY IF EXISTS leytech_server_access ON public.${name};\nCREATE POLICY leytech_server_access ON public.${name} FOR ALL TO ${role} USING (true) WITH CHECK (true);\nGRANT SELECT${name==='schema_migrations'?'':',INSERT,UPDATE,DELETE'} ON public.${name} TO ${role};`).join('\n');
const sql=`BEGIN;\n-- Solo se crea un acceso de aplicación limitado a las tablas de Leytech.\nDO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} LOGIN PASSWORD '${access.password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS CONNECTION LIMIT 40; END IF; END $$;\nGRANT CONNECT ON DATABASE postgres TO ${role};\nGRANT USAGE ON SCHEMA public TO ${role};\n${schema}\n${updates}\n${privacy}\n${permissions}\nGRANT USAGE,SELECT ON SEQUENCE quotes_code_seq,orders_code_seq,claims_code_seq TO ${role};\nCOMMIT;\nSELECT 'Leytech: tablas creadas y acceso privado configurado' AS resultado;\n`;
await fs.writeFile('.data/supabase-bootstrap.sql',sql);
await fs.writeFile('.data/supabase-bootstrap-review.txt',`Proyecto: ${access.project}\nUsuario técnico: ${role}\nTablas: ${names.join(', ')}\nPermisos: conexión y operaciones de datos solo en tablas Leytech. Sin superusuario, creación de bases/roles ni bypass de RLS.\nAcceso público anon/authenticated: revocado para estas tablas.\nNo se modifica la contraseña del propietario ni se eliminan tablas o datos.\nLa credencial queda únicamente en archivos locales excluidos de Git y variables privadas de Vercel.\n`);
console.log('SQL y resumen de permisos preparados en .data. No se ejecutó ninguna operación remota.');
