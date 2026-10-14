/** Inline-Skripte für <head> (Server-Modul, kein Client-Code). */
/** Läuft vor dem ersten Paint (Inline-Skript im <head>): Darstellung und Sprache (gleiche Regel wie detectLang). */
export const themeBootScript = `(function(){var h=document.documentElement;try{var t=localStorage.getItem('hb-theme');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);h.dataset.theme=d?'dark':'light';}catch(e){}var l=null;try{l=localStorage.getItem('hb-lang');}catch(e){}if(l!=='de'&&l!=='en'&&l!=='hu'){l='de';var ls=navigator.languages||[navigator.language];for(var i=0;i<ls.length;i++){var s=(ls[i]||'').slice(0,2).toLowerCase();if(s==='de'||s==='en'||s==='hu'){l=s;break;}}}h.lang=l;})();`;

/** Fängt das Installations-Ereignis von Chrome ab, auch wenn es vor der Hydrierung kommt. */
export const installBootScript = `window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__hbInstallPrompt=e;window.dispatchEvent(new Event('hb:installprompt'));});window.addEventListener('appinstalled',function(){window.__hbInstalled=true;window.dispatchEvent(new Event('hb:installed'));});`;
