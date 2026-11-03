# ReHabita

Aplicación React con API Express, sesiones persistentes y base de datos SQLite para desarrollo local o PostgreSQL en Supabase para el despliegue.

## Desarrollo local

Requiere Node.js 22.13 o superior.

```sh
npm install
npm run dev
```

Vite sirve la aplicación solo en loopback y envía `/api` al servidor local. En desarrollo el servidor genera una clave de sesión aleatoria en memoria al iniciar; las sesiones activas se invalidan al reiniciarlo. La base SQLite queda en `.data/rehabita.sqlite` por defecto. Si se define `DATABASE_URL`, la API y el comando de creación de terapeuta usan PostgreSQL. El modo de desarrollo usa HTTP; usá datos ficticios únicamente, nunca datos personales ni de salud reales.

## Crear la cuenta inicial de terapeuta

La creación inicial no tiene endpoint público. Ejecutá una sola vez, desde una terminal interactiva:

```sh
npm run create:therapist
```

El comando pide el DNI de 7 u 8 dígitos y una contraseña de al menos 12 caracteres, que no se muestra mientras se escribe. No hay credenciales predeterminadas. Solo se permite una cuenta de terapeuta; una segunda ejecución se rechaza.

La terapeuta puede crear cuentas de paciente después de iniciar sesión. La ficha y la cuenta se guardan en una única transacción; cada paciente queda vinculado a la terapeuta y a un ID interno. El DNI es único y se puede registrar opcionalmente la fecha de nacimiento. No existe registro público.

## Producción

1. Compilá la interfaz: `npm run build`.
2. Configurá `NODE_ENV=production`, `SESSION_SECRET` con al menos 32 caracteres aleatorios y `DATABASE_URL` con una conexión PostgreSQL privada/pooler. Podés generar la clave con `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"` y establecerla como variable de entorno del proceso o servicio; no la guardes en el repositorio. El archivo `.env.example` es solo una referencia: el proyecto no carga archivos `.env` automáticamente.
3. Ejecutá `npm start`.
4. Usá HTTPS. Si TLS termina en un proxy inverso de confianza, configurá además `TRUST_PROXY=1`.
5. Ejecutá `npm run create:therapist` en una terminal segura para inicializar la cuenta antes del primer uso.

La cookie de sesión es `HttpOnly`, `SameSite=Lax` y `Secure` en producción. Los cambios requieren un token CSRF de sesión; el inicio de sesión rota la sesión y el cierre de sesión la invalida. Las contraseñas se almacenan con scrypt y sal aleatoria, nunca en texto plano. La API verifica rol en cada operación protegida; los pacientes solo pueden consultar su propia ficha y los ejercicios asignados a su plan. Las credenciales y los roles no se almacenan en el navegador.

La base contiene datos personales. Protegé el acceso a la base y sus respaldos; no publiques `.data/`, `.env` ni cadenas de conexión. Para producción con datos reales de salud, revisar además requisitos legales, política de conservación, copias de seguridad cifradas, monitoreo y seguridad operacional del entorno antes de desplegar.

## Demo de revisión en Vercel + Supabase

La interfaz y la API Express se publican en el mismo proyecto Vercel. La función `api/[...path].js` ejecuta la API y conserva las rutas `/api/*`; Supabase aloja PostgreSQL, incluidas las cuentas, los pacientes, las asignaciones y las sesiones web. El frontend continúa usando las mismas rutas y no recibe credenciales de base de datos.

1. Creá un proyecto Supabase y ejecutá el SQL de `supabase/migrations/20261103000000_initial_schema.sql` en el SQL Editor del proyecto.
2. En Supabase, obtené la cadena PostgreSQL del **Transaction Pooler**. En Vercel, importá el repositorio `luciasalgado02/rehabita-demo` y configurá `DATABASE_URL` con esa cadena, `SESSION_SECRET` con un valor aleatorio de al menos 32 caracteres, `APP_ORIGIN` con el origen exacto de producción de Vercel (por ejemplo, `https://rehabita-demo.vercel.app`, sin barra final) y `TRUST_PROXY=1` para que las cookies seguras funcionen detrás del proxy HTTPS. Guardá las variables solo en Vercel, nunca en GitHub ni en variables `VITE_*`.
3. Desplegá en Vercel. Comprobá que `https://<dominio-vercel>/api/health` responda `{"status":"ok"}`.
4. Creá la cuenta de demostración de terapeuta ejecutando `npm run create:therapist` en una terminal local segura con `DATABASE_URL` temporalmente configurada con la conexión privada del proyecto. El comando pide las credenciales de forma interactiva y guarda solo el hash de contraseña. No agregues esa cadena a `.env` ni la compartas por chat.
5. Iniciá sesión como terapeuta, creá una cuenta de paciente ficticia desde «Nuevo paciente» y verificá los dos paneles. Compartí el dominio y las credenciales demo por un canal privado.

El despliegue no copia la base local ni sus sesiones: empezará vacío para no publicar DNI, hashes de contraseñas ni datos clínicos de la máquina local. El proyecto de Supabase puede pausarse o tener límites en el plan gratuito; revisá los límites vigentes antes de compartir la demo. El dominio de Vercel será accesible por Internet; usá solo datos ficticios y compartilo con los revisores previstos.

## Preparado para próximas etapas

La terapeuta puede consultar la ficha de sus pacientes, crear cuentas y asignar ejercicios desde las mismas categorías de la lista de ejercicios. Cada asignación se persiste en el plan individual del paciente; el acceso del paciente se verifica en la API y en la interfaz. Al eliminar un paciente se borran su cuenta, ficha y planificación en una transacción. Si existen registros de sesiones, la eliminación se rechaza para preservar el historial clínico hasta que haya una política de retención definida. La demostración del movimiento sigue en mantenimiento hasta que se incorpore el avatar.

## Verificación

```sh
npm test
npm run lint
npm run build
```
