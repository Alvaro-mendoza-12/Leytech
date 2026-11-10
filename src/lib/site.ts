export function siteUrl(){
 const configured=process.env.NEXT_PUBLIC_SITE_URL;
 const automatic=process.env.VERCEL_PROJECT_PRODUCTION_URL;
 return (configured|| (automatic?`https://${automatic}`:'http://localhost:3000')).replace(/\/$/,'');
}
export function trustedOrigins(){const values=[siteUrl()];if(process.env.VERCEL_URL)values.push(`https://${process.env.VERCEL_URL}`);return new Set(values.map(value=>new URL(value).origin));}
