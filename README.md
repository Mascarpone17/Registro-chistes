# Registro Internacional del Chiste

Sitio para registrar chistes a tu nombre, organizados por idioma y categoría,
con un certificado con número de folio para cada uno. Incluye además el
**Patrimonio**: una selección de chistes clásicos de tradición oral, sin autor,
que nadie puede registrar a su nombre.

Sitio estático (HTML/CSS/JS puro) con Firebase Authentication y Firestore —
sin backend propio.

## Qué incluye

- **Registro**: cualquier persona con cuenta publica chistes a su nombre. Cada
  uno recibe un folio (ej. `RIC-ES-2026-A1B2C3`) y una página de certificado
  con autor, país, fecha y hora, idioma y categoría, para compartir o imprimir.
- **División por idioma**: 19 idiomas más "Otro". El registro se filtra por
  idioma y por categoría, y los filtros quedan en la URL
  (ej. `#/registro?lang=fr&cat=colmos`) para compartir esos listados.
- **Categorías**: juegos de palabras, absurdo, colmos, toc toc, médicos,
  escuela, bares, animales, tecnología, familia, profesiones, humor negro, otros.
- **Patrimonio**: 33 clásicos en 8 idiomas (español, inglés, portugués, francés,
  italiano, alemán, ruso y japonés), con procedencia y una nota que explica el
  juego de palabras cuando hace falta. Están en [`patrimonio.js`](patrimonio.js):
  para sumar más, agregá entradas a esa lista.
- **Protección contra copias**:
  - Si alguien intenta registrar un texto que ya está registrado (aunque cambie
    mayúsculas, acentos o signos de puntuación), el sitio le muestra a nombre de
    quién está y el link al certificado. Lo garantizan las reglas de Firestore,
    no solo el navegador.
  - Los chistes del Patrimonio (y variantes muy parecidas) no se pueden registrar.
  - La fecha de registro la pone el servidor: no se puede antedatar.
  - Un chiste registrado no se puede editar, solo borrar (por su autor o por el admin).
    Al borrarlo, el texto queda libre para que otra persona lo registre.
- **Autor desconocido**: al publicar se puede elegir "Es mío" o "Autor
  desconocido" (un chiste que circula y no se sabe de quién es). Los de autor
  desconocido quedan como aportados por quien los subió, aparecen en una sección
  aparte de su página y se pueden filtrar en el registro. También están
  protegidos contra duplicados.
- **Risas**: el equivalente a un "me gusta". Se puede ordenar el registro por
  más risas.
- **Páginas de autor**: nombre, país, biografía, total de risas y todos sus chistes.
- **Administración**: la cuenta admin (`reyesblas200910@gmail.com`, en
  `firestore.rules` y `app.js`) puede:
  - borrar cualquier chiste (botón "Borrar" en cada tarjeta y en el certificado);
  - dar o quitar la insignia de **verificado** ✓ a cualquier autor, incluida
    ella misma, desde el panel **Admin** del menú o desde la página de cada autor.
    Nadie más puede tocar ese campo, ni siquiera en su propio perfil.

  Los permisos de admin exigen que el email de esa cuenta esté **confirmado**
  (Firebase deja crear cuentas con cualquier email sin probar que es tuyo). Si
  todavía no lo está, en **Mi perfil** aparece un botón para mandarte el email de
  confirmación; después de tocar el link, cerrá sesión y volvé a entrar.
- Lectura pública: no hace falta cuenta para leer el registro ni el Patrimonio,
  solo para publicar y reírse.

## 1. Configurar Firebase

Este sitio usa un proyecto de Firebase propio (no el de Amplificado).

1. Entrá a https://console.firebase.google.com y creá un proyecto nuevo (ej. `registro-chistes`).
2. **Authentication → Get started → Sign-in method → Email/Password → habilitar**.
3. **Firestore Database → Create database** (modo producción, la región más cercana).
4. En **Firestore Database → Reglas**, pegá el contenido de [`firestore.rules`](firestore.rules) y publicá.
5. **Configuración del proyecto** (engranaje) **→ General → Tus apps →** ícono web `</>` → registrá una app.
6. Copiá los valores de `firebaseConfig` en [`firebase-config.js`](firebase-config.js), reemplazando los `TU_XXX`.

Mientras `firebase-config.js` tenga los `TU_XXX`, el sitio funciona en "modo
vitrina": se puede recorrer todo el Patrimonio y el registro muestra un aviso.

No hace falta crear índices compuestos: las consultas solo combinan filtros de
igualdad y el orden se aplica en el navegador.

**Cada vez que cambie `firestore.rules`** hay que volver a pegarlo en
Firestore → Reglas y publicar: el sitio no las sube solo.

## 2. Probarlo en tu computadora

```bash
npx serve .
```

Y abrís `http://localhost:3000`.

## 3. Publicarlo (Vercel)

1. En https://vercel.com: **Add New… → Project** y elegí este repo.
2. Framework Preset: **Other** (sin build command).
3. **Deploy**.
4. En Firebase, **Authentication → Settings → Authorized domains**, agregá el dominio que te dio Vercel.

## Estructura

```
index.html          página y estilos
app.js              lógica: rutas, registro, patrimonio, certificados, autores, risas
patrimonio.js       los chistes clásicos sin autor
firebase-config.js  tu configuración de Firebase (paso 1)
firestore.rules     reglas de seguridad para pegar en Firestore → Reglas
```

## Modelo de datos (Firestore)

```
users/{uid}      displayName, country, bio, laughedJokeIds[], verified, createdAt
jokes/{id}       text, lang, category, authorId, authorName, authorCountry,
                 fingerprint, anonymous, laughs, createdAt
huellas/{hash}   jokeId, authorId, authorName, anonymous, createdAt
```

En los chistes con `anonymous: true`, `authorId`/`authorName` son de quien lo
aportó, no del autor (que es desconocido).

`huellas` guarda el SHA-256 del texto normalizado de cada chiste. Las reglas
exigen que cada chiste se cree junto con su huella, y una huella existente no
se puede volver a crear: así el primero que registra un texto se lo queda.

## Limitaciones conocidas

- Cada listado del registro trae hasta 300 chistes por consulta. Con mucho más
  volumen va a hacer falta paginar.
- La huella la calcula el navegador. Alguien que escriba directo contra la API
  de Firestore podría poner una huella falsa; el texto exacto seguiría
  protegido para quienes usan el sitio, pero no frente a esa persona.
- La comparación con el Patrimonio es por parecido de texto dentro del mismo
  idioma escrito: una traducción a otro idioma no se detecta.
- El nombre del autor queda fijo en cada certificado al momento de registrar;
  cambiarlo en el perfil no modifica los registros anteriores.
- La interfaz está en español; los chistes pueden estar en cualquier idioma.
