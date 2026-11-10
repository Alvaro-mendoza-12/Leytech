import fs from 'node:fs/promises';
process.loadEnvFile('.env.local');
const base=process.env.STORAGE_SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY||process.env.STORAGE_SERVICE_ROLE_KEY,bucket=process.env.STORAGE_BUCKET||'leytech-products';
if(!key||key.startsWith('sb_publishable_'))throw new Error('Falta la clave privada de servidor.');
const headers={apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:`Bearer ${key}`})};
const response=await fetch(`${base}/storage/v1/bucket/${bucket}`,{headers,signal:AbortSignal.timeout(15000)});
if(response.ok){const existing=await response.json();if(existing.public)throw new Error('El bucket existente es público. Se necesita revisar antes de cambiarlo.');console.log('Bucket privado de Leytech verificado.');}
else {const detail=await response.json().catch(()=>({}));if(response.status===401||response.status===403||detail.statusCode==='403')throw new Error('La clave privada no tiene acceso válido a Storage.');if(response.status!==404&&String(detail.statusCode)!=='404'&&!String(detail.message||'').includes('not found'))throw new Error(`No se pudo consultar Storage: HTTP ${response.status}`);const created=await fetch(`${base}/storage/v1/bucket`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({id:bucket,name:bucket,public:false,file_size_limit:5000000,allowed_mime_types:['image/jpeg','image/png','image/webp']}),signal:AbortSignal.timeout(15000)});if(!created.ok)throw new Error(`No se pudo crear el bucket: HTTP ${created.status}`);console.log('Bucket privado de fotografías creado con límite de 5 MB.');}
const access=JSON.parse(await fs.readFile('.data/supabase-access.json','utf8'));
const database=`postgresql://${access.username}.${access.project}:${encodeURIComponent(access.password)}@${access.host}:${access.port}/postgres`;
const certificate=await fetch('https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt',{signal:AbortSignal.timeout(15000)});
if(!certificate.ok)throw new Error('No se pudo descargar el certificado oficial de Supabase.');
const ca=await certificate.text();if(!ca.includes('BEGIN CERTIFICATE'))throw new Error('Certificado de Supabase inválido.');
const variables={DATABASE_URL:database,DATABASE_SSL:'true',DATABASE_POOL_MAX:'1',DATABASE_CA_CERT_BASE64:Buffer.from(ca).toString('base64'),STORAGE_SUPABASE_URL:base,SUPABASE_SECRET_KEY:key,STORAGE_BUCKET:bucket,TRUST_PROXY:'false'};
await fs.writeFile('.data/production.env',Object.entries(variables).map(([name,value])=>`${name}=${value}`).join('\n')+'\n');
console.log('Variables de producción preparadas en archivo privado; no se imprimieron sus valores.');
