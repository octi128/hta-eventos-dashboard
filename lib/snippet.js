// Código que se instala en Framer (custom code, al final del <head>).
// El bloque inline corre antes que Framer y guarda la URL original; t.js se carga desde Vercel.
export const TRACKING_SNIPPET = `<script>(function(){try{window.__htaFirst={search:location.search};var p=new URLSearchParams(location.search),s={},h=0;["utm_source","utm_medium","utm_campaign","utm_content","utm_term"].forEach(function(k){if(p.get(k)){s[k]=p.get(k).slice(0,100);h=1}});if(h)localStorage.setItem("hta_src",JSON.stringify(s));var v=p.get("hta_v"),e=p.get("hta_e");if(e&&(v==="A"||v==="B"))localStorage.setItem("hta_exp",JSON.stringify({e:e.slice(0,40),v:v,t:Date.now()}))}catch(x){}})();</script>
<script async src="https://hta-eventos-dashboard.vercel.app/t.js"></script>`;
