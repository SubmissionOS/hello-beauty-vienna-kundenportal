/** Inline-Skripte für <head> (Server-Modul, kein Client-Code). */
/** Läuft vor dem ersten Paint (Inline-Skript im <head>), damit nichts aufblitzt. */
export const themeBootScript = `(function(){try{var t=localStorage.getItem('hb-theme');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';var l=localStorage.getItem('hb-lang');if(l==='de'||l==='en'||l==='hu')document.documentElement.lang=l;}catch(e){}})();`;

/** Fängt das Installations-Ereignis von Chrome ab, auch wenn es vor der Hydrierung kommt. */
export const installBootScript = `window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__hbInstallPrompt=e;window.dispatchEvent(new Event('hb:installprompt'));});window.addEventListener('appinstalled',function(){window.__hbInstalled=true;window.dispatchEvent(new Event('hb:installed'));});`;
