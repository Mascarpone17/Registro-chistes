// Configuración de Firebase del Registro Internacional del Chiste.
// Es un proyecto de Firebase APARTE del de Amplificado (usuarios y datos separados).
//
// 1. Andá a https://console.firebase.google.com y creá un proyecto nuevo (ej. "registro-chistes").
// 2. Authentication > Get started > Sign-in method > habilitá "Email/Password".
// 3. Firestore Database > Create database > modo producción. Después, en Firestore Database > Reglas,
//    pegá el contenido de firestore.rules (en la raíz del repo) y publicá.
// 4. Configuración del proyecto (engranaje) > General > "Tus apps" > ícono web </> > registrá una app.
// 5. Copiá los valores de firebaseConfig acá abajo, reemplazando los TU_XXX.
//
// Mientras queden los TU_XXX el sitio funciona en "modo vitrina": se puede recorrer
// todo el Patrimonio, pero el registro de chistes de usuarios queda desactivado.

var firebaseConfig = {
  apiKey: "AIzaSyB0ZTn7XpFUPZERszX2hV4I-fa99i2QLFU",
  authDomain: "registro-chistes.firebaseapp.com",
  projectId: "registro-chistes",
  storageBucket: "registro-chistes.firebasestorage.app",
  messagingSenderId: "1045523203686",
  appId: "1:1045523203686:web:ba2b686f0204098e868fa7"
};

if(firebaseConfig.apiKey.indexOf("TU_") !== 0){
  firebase.initializeApp(firebaseConfig);
}
