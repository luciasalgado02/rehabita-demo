# ReHabita

Aplicación React con una API Express y persistencia SQLite para cuentas de terapeuta y paciente.

## Desarrollo local

Requiere Node.js 22.13 o superior.

```sh
npm install
npm run dev
```

Vite sirve la aplicación solo en loopback y envía `/api` al servidor local. En desarrollo el servidor genera una clave de sesión aleatoria en memoria al iniciar; las sesiones activas se invalidan al reiniciarlo. La base queda en `.data/rehabita.sqlite` por defecto. Se puede cambiar con `DATABASE_PATH`. El modo de desarrollo usa HTTP; usá datos ficticios únicamente, nunca datos personales ni de salud reales.

## Crear la cuenta inicial de terapeuta

La creación inicial no tiene endpoint público. Ejecutá una sola vez, desde una terminal interactiva:

```sh
npm run create:therapist
```

El comando pide el DNI de 7 u 8 dígitos y una contraseña de al menos 12 caracteres, que no se muestra mientras se escribe. No hay credenciales predeterminadas. Solo se permite una cuenta de terapeuta; una segunda ejecución se rechaza.

La terapeuta puede crear cuentas de paciente después de iniciar sesión. La ficha y la cuenta se guardan en una única transacción; cada paciente queda vinculado a la terapeuta y a un ID interno. El DNI es único y se puede registrar opcionalmente la fecha de nacimiento. No existe registro público.

## Producción

1. Compilá la interfaz: `npm run build`.
2. Configurá `NODE_ENV=production`, `SESSION_SECRET` con al menos 32 caracteres aleatorios, `PORT` y, opcionalmente, `DATABASE_PATH`. Podés generar la clave con `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"` y establecerla como variable de entorno del proceso o servicio; no la guardes en el repositorio. El archivo `.env.example` es solo una referencia: el proyecto no carga archivos `.env` automáticamente.
3. Ejecutá `npm start`.
4. Usá HTTPS. Si TLS termina en un proxy inverso de confianza, configurá además `TRUST_PROXY=1`.
5. Ejecutá `npm run create:therapist` en una terminal segura para inicializar la cuenta antes del primer uso.

La cookie de sesión es `HttpOnly`, `SameSite=Lax` y `Secure` en producción. Los cambios requieren un token CSRF de sesión; el inicio de sesión rota la sesión y el cierre de sesión la invalida. Las contraseñas se almacenan con scrypt y sal aleatoria, nunca en texto plano. La API verifica rol en cada operación protegida; los pacientes solo pueden consultar su propia ficha y los ejercicios asignados a su plan. Las credenciales y los roles no se almacenan en el navegador.

La base SQLite contiene datos personales. Protegé el acceso al archivo y a sus respaldos con controles del sistema operativo y cifrado de disco; no publiques `.data/`. Para producción con datos reales de salud, revisar además requisitos legales, política de conservación, copias de seguridad cifradas, monitoreo y seguridad operacional del entorno antes de desplegar.

## Demo de revisión en Vercel + Render

El frontend se publica en Vercel y la API Express con SQLite persistente en Render. El `render.yaml` configura un servicio Starter y un disco persistente; no uses un servicio sin disco para la base. `vercel.json` envía las llamadas `/api/*` a `https://rehabita-demo-api.onrender.com`.

1. Importá `luciasalgado02/rehabita-demo` en Vercel y desplegá la rama `main`. El build usa `npm run build` y publica `dist`; anotá el dominio HTTPS asignado.
2. En Render, creá un Blueprint desde el mismo repositorio y elegí `render.yaml`. Cuando solicite `APP_ORIGIN`, ingresá el origen exacto de Vercel, por ejemplo `https://rehabita-demo.vercel.app`, sin barra final. `SESSION_SECRET` se genera en Render; no lo copies al repositorio ni al frontend.
3. Esperá que `https://rehabita-demo-api.onrender.com/api/health` responda `{"status":"ok"}` y redeployá Vercel para activar el rewrite al API.
4. Desde el Shell privado del servicio Render, ejecutá `npm run create:therapist` y definí las credenciales de demostración. Iniciá sesión y creá pacientes de prueba desde «Nuevo paciente». Compartí las credenciales de revisión por un canal privado, no en el repositorio ni en una URL pública.

El disco Render mantiene `.data` fuera del repositorio. La base local y sus sesiones no se copian: el servicio de revisión inicia vacío para no publicar DNI, hashes de contraseñas ni datos clínicos de la máquina local. Creá cuentas de demostración nuevas en el servicio remoto. El dominio de Vercel será accesible por Internet; compartilo solo con los revisores previstos y usá exclusivamente datos ficticios.

## Preparado para próximas etapas

La terapeuta puede consultar la ficha de sus pacientes, crear cuentas y asignar ejercicios desde las mismas categorías de la lista de ejercicios. Cada asignación se persiste en el plan individual del paciente; el acceso del paciente se verifica en la API y en la interfaz. Al eliminar un paciente se borran su cuenta, ficha y planificación en una transacción. Si existen registros de sesiones, la eliminación se rechaza para preservar el historial clínico hasta que haya una política de retención definida. La demostración del movimiento sigue en mantenimiento hasta que se incorpore el avatar.

## Verificación

```sh
npm test
npm run lint
npm run build
```
