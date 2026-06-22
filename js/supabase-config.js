/* Configuración y cliente de Supabase (nube). La clave publicable es segura
   en el navegador porque la tabla tiene RLS activado (cada usuario solo ve lo suyo). */
const SUPABASE_URL = 'https://kqqrlsuaxhuoziheboks.supabase.co';
const SUPABASE_KEY = 'sb_publishable_XyyglDboudkU6Fy0shhbZA_3Ak_hMZL';

// window.supabase lo define la librería UMD (js/lib/supabase.js).
window.sb = (window.supabase && window.supabase.createClient)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;
