# Rifa escolar

Aplicación web estática, responsive y sin backend para consultar ganadores de una rifa escolar usando resultados oficiales de Lotería Nacional.

La identidad visual utiliza el escudo oficial del Liceo Carl Ransom Rogers y recursos gráficos del sitio institucional.

## Uso local

Abre `index.html` directamente en un navegador moderno. No requiere instalación ni dependencias.

## Acceso de administración

El acceso usa **Supabase Auth** (correo y contraseña). Ya no hay contraseña por defecto ni botón para restablecerla sin entrar. La contraseña vive en Supabase, así que un cambio aplica en todos los equipos.

Pasos de configuración (una sola vez) en el panel de Supabase del proyecto:

1. **Authentication > Sign In / Providers > Email**: deja activo el proveedor Email y **desactiva "Allow new users to sign up"**, para que nadie pueda crearse una cuenta.
2. **Authentication > Users > Add user > Create new user**: crea la cuenta de cada persona de administración con su correo y una contraseña de al menos 10 caracteres (marca "Auto Confirm User").
3. **Authentication > URL Configuration**: en *Site URL* pon la dirección pública del sitio (por ejemplo `https://tu-rifa.netlify.app`) y agrégala también en *Redirect URLs*. Así funciona el enlace de "¿Olvidaste tu contraseña?".
4. **SQL Editor**: ejecuta completo `supabase/rls-rifa.sql` (crea `rifa_admins` y protege `rifa_estado`: lectura pública, escritura solo para administradores) y luego da de alta a cada administrador:
   ```sql
   insert into public.rifa_admins (user_id)
   select id from auth.users where email = 'correo@ejemplo.com';
   ```
5. Detalles y comprobaciones en `supabase/CONFIGURAR-SUPABASE.md`.

Para cambiar la contraseña: entra y usa **Configuración > Nueva contraseña**, o pulsa **¿Olvidaste tu contraseña?** en la pantalla de acceso para recibir un enlace por correo. Para quitar a alguien, bórralo de `rifa_admins` o de **Authentication > Users**.

## Datos

Los datos públicos (boletos sin nombres ni teléfonos, resultados y ganadores) se publican en Supabase solo cuando hay una sesión de administración. Nombres y teléfonos se quedan en `localStorage` del navegador de administración. Exporta un respaldo JSON desde la administración antes de cambiar de equipo o limpiar datos del navegador.

## Despliegue

Esta carpeta puede desplegarse directamente en Netlify o Vercel como sitio estático.
