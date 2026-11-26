# Configurar Supabase para proteger los resultados

Después de estos pasos, el público solo puede **leer** los resultados y únicamente las cuentas de administración pueden publicarlos. No hace falta compartir ninguna clave: todo se hace en el panel de Supabase.

## 1. Crear la cuenta de administración
1. Entra a tu proyecto en supabase.com.
2. Ve a **Authentication > Users > Add user > Create new user**.
3. Escribe el correo y una contraseña segura, y marca **Auto Confirm User**.
4. Repite para cada persona que vaya a administrar la rifa.

## 2. Aplicar las reglas de seguridad (RLS)
1. Ve a **SQL Editor > New query**.
2. Pega todo el contenido de `supabase/rls-rifa.sql` y pulsa **Run**.
3. En una consulta nueva, da de alta a cada administrador con su correo:
   ```sql
   insert into public.rifa_admins (user_id)
   select id from auth.users where email = 'correo-del-admin@ejemplo.com'
   on conflict do nothing;
   ```

## 3. Ajustes recomendados de Auth
- **Authentication > Sign In / Providers > Email**: desactiva **Allow new users to sign up** para que nadie más pueda crearse una cuenta. (Aunque alguien se registre, no podría escribir porque no está en `rifa_admins`.)
- **Authentication > URL Configuration**: pon la dirección pública del sitio (Netlify o Vercel) en **Site URL**.

## 4. Comprobar
- Abre el sitio en una ventana privada: los resultados deben verse.
- Entra en **Administración** con el correo y contraseña del paso 1, cambia algo y verifica en **Table Editor > rifa_estado** que `updated_at` cambió.
- Si al publicar aparece "esta cuenta no tiene permiso de administración", falta el paso 2.3 para ese correo.

## Qué cambió en el sitio
- Los visitantes ya no escriben nunca en Supabase. Antes, si un visitante no lograba cargar los datos, su navegador volvía a subir su copia local y podía borrar los resultados reales.
- La publicación solo ocurre con una sesión de administración de Supabase (el token de la sesión viaja en cada escritura; la clave pública sola ya no sirve para escribir).
- Si la administración no logró leer los datos publicados, el sitio pregunta antes de reemplazarlos.
- La clave `sb_publishable_...` que está en `app.js` puede seguir ahí: con RLS activo solo permite leer.
