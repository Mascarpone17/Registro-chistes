(function(){
  "use strict";

  var ADMIN_EMAIL = "reyesblas200910@gmail.com";
  var MAX_LEN = 2000;

  // Deben coincidir con validLang / validCategory en firestore.rules.
  var LANGS = [
    { code:"es", label:"Español" },
    { code:"en", label:"English" },
    { code:"pt", label:"Português" },
    { code:"fr", label:"Français" },
    { code:"it", label:"Italiano" },
    { code:"de", label:"Deutsch" },
    { code:"ca", label:"Català" },
    { code:"gl", label:"Galego" },
    { code:"eu", label:"Euskara" },
    { code:"nl", label:"Nederlands" },
    { code:"ru", label:"Русский" },
    { code:"pl", label:"Polski" },
    { code:"tr", label:"Türkçe" },
    { code:"ar", label:"العربية" },
    { code:"he", label:"עברית" },
    { code:"hi", label:"हिन्दी" },
    { code:"zh", label:"中文" },
    { code:"ja", label:"日本語" },
    { code:"ko", label:"한국어" },
    { code:"otro", label:"Otro idioma" }
  ];
  var CATEGORIES = [
    { key:"palabras", label:"Juegos de palabras" },
    { key:"absurdo", label:"Absurdo" },
    { key:"colmos", label:"Colmos" },
    { key:"toctoc", label:"Toc toc" },
    { key:"medicos", label:"Médicos y pacientes" },
    { key:"escuela", label:"Escuela" },
    { key:"bares", label:"Bares y restaurantes" },
    { key:"animales", label:"Animales" },
    { key:"tecnologia", label:"Tecnología" },
    { key:"familia", label:"Familia y pareja" },
    { key:"profesiones", label:"Profesiones" },
    { key:"humor-negro", label:"Humor negro" },
    { key:"otros", label:"Otros" }
  ];

  var FB_READY = typeof firebase !== "undefined" && firebase.apps && firebase.apps.length > 0;
  var auth = FB_READY ? firebase.auth() : null;
  var db = FB_READY ? firebase.firestore() : null;
  var FieldValue = FB_READY ? firebase.firestore.FieldValue : null;

  var currentUser = null;
  var currentProfile = null;
  var authResolved = !FB_READY;
  var renderToken = 0;
  var afterLogin = null;
  var pendingSignup = null;

  var main = document.getElementById("main");
  var nav = document.getElementById("nav");
  var navAuth = document.getElementById("navAuth");
  var toastEl = document.getElementById("toast");

  // ---------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------
  function escapeHtml(str){
    return String(str == null ? "" : str).replace(/[&<>"']/g, function(c){
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  }
  function initials(name){
    name = (name || "?").trim();
    if(!name) return "?";
    var parts = name.split(/\s+/);
    var s = parts[0][0] || "";
    if(parts.length > 1) s += parts[parts.length - 1][0] || "";
    return s.toUpperCase();
  }
  function langLabel(code){
    for(var i = 0; i < LANGS.length; i++) if(LANGS[i].code === code) return LANGS[i].label;
    return code || "";
  }
  function catLabel(key){
    for(var i = 0; i < CATEGORIES.length; i++) if(CATEGORIES[i].key === key) return CATEGORIES[i].label;
    return key || "";
  }
  function htmlLang(code){
    return code && code !== "otro" ? code : "";
  }
  function toDate(ts){
    if(!ts) return null;
    if(ts.toDate) return ts.toDate();
    if(ts instanceof Date) return ts;
    return null;
  }
  function formatDate(ts){
    var d = toDate(ts) || new Date();
    return d.toLocaleDateString("es", { day:"numeric", month:"long", year:"numeric" });
  }
  function formatDateTime(ts){
    var d = toDate(ts) || new Date();
    return formatDate(d) + ", " + d.toLocaleTimeString("es", { hour:"2-digit", minute:"2-digit" }) + " h";
  }
  function folioFor(joke){
    var d = toDate(joke.createdAt) || new Date();
    return "RIC-" + String(joke.lang || "xx").toUpperCase() + "-" + d.getFullYear() + "-" + String(joke.id).slice(0, 6).toUpperCase();
  }
  function patFolio(p){ return "PAT-" + p.id; }
  function plural(n, one, many){ return n + " " + (n === 1 ? one : many); }

  // Normaliza un texto para comparar chistes: minúsculas, sin acentos ni
  // signos de puntuación. "¡Hola, CAMARERO!" y "hola camarero" quedan iguales.
  function normalizeText(s){
    return String(s || "").toLowerCase().normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }
  function sha256Hex(str){
    var data = new TextEncoder().encode(str);
    return crypto.subtle.digest("SHA-256", data).then(function(buf){
      return Array.prototype.map.call(new Uint8Array(buf), function(b){
        return ("0" + b.toString(16)).slice(-2);
      }).join("");
    });
  }
  // Coeficiente de Dice sobre bigramas de caracteres (0 = nada que ver, 1 = idénticos).
  function similarity(a, b){
    a = a.replace(/ /g, ""); b = b.replace(/ /g, "");
    if(a === b) return 1;
    if(a.length < 2 || b.length < 2) return 0;
    var grams = {}, i, g, hits = 0;
    for(i = 0; i < a.length - 1; i++){ g = a.substr(i, 2); grams[g] = (grams[g] || 0) + 1; }
    for(i = 0; i < b.length - 1; i++){ g = b.substr(i, 2); if(grams[g] > 0){ grams[g]--; hits++; } }
    return (2 * hits) / (a.length + b.length - 2);
  }
  function findPatrimonioMatch(text){
    var norm = normalizeText(text);
    for(var i = 0; i < PATRIMONIO.length; i++){
      if(similarity(norm, normalizeText(PATRIMONIO[i].text)) >= 0.85) return PATRIMONIO[i];
    }
    return null;
  }
  function findPatrimonio(id){
    for(var i = 0; i < PATRIMONIO.length; i++) if(PATRIMONIO[i].id === id) return PATRIMONIO[i];
    return null;
  }

  var toastTimer = null;
  function toast(msg){
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ toastEl.hidden = true; }, 2800);
  }
  function isAdmin(){
    return !!(currentUser && currentUser.email === ADMIN_EMAIL);
  }
  function laughedIds(){
    return (currentProfile && currentProfile.laughedJokeIds) || [];
  }
  function friendlyError(err){
    var code = err && err.code || "";
    var map = {
      "auth/invalid-email":"Ese email no parece válido.",
      "auth/user-not-found":"No hay ninguna cuenta con ese email.",
      "auth/wrong-password":"Contraseña incorrecta.",
      "auth/invalid-credential":"Email o contraseña incorrectos.",
      "auth/invalid-login-credentials":"Email o contraseña incorrectos.",
      "auth/email-already-in-use":"Ya existe una cuenta con ese email.",
      "auth/weak-password":"La contraseña tiene que tener al menos 6 caracteres.",
      "auth/too-many-requests":"Demasiados intentos. Esperá un rato y probá de nuevo.",
      "permission-denied":"No tenés permiso para hacer eso."
    };
    return map[code] || (err && err.message) || "Algo salió mal.";
  }

  function langOptions(selected, withAll){
    var html = withAll ? '<option value="">Todos los idiomas</option>' : "";
    LANGS.forEach(function(l){
      html += '<option value="' + l.code + '"' + (l.code === selected ? " selected" : "") + ">" + escapeHtml(l.label) + "</option>";
    });
    return html;
  }
  function catOptions(selected, withAll){
    var html = withAll ? '<option value="">Todas las categorías</option>' : '<option value="" disabled' + (selected ? "" : " selected") + '>Elegí una categoría</option>';
    CATEGORIES.forEach(function(c){
      html += '<option value="' + c.key + '"' + (c.key === selected ? " selected" : "") + ">" + escapeHtml(c.label) + "</option>";
    });
    return html;
  }
  function guessLang(){
    var nav = (navigator.language || "es").slice(0, 2).toLowerCase();
    for(var i = 0; i < LANGS.length; i++) if(LANGS[i].code === nav) return nav;
    return "es";
  }

  // ---------------------------------------------------------------------
  // tarjetas
  // ---------------------------------------------------------------------
  function laughBtnHtml(joke){
    var on = laughedIds().indexOf(joke.id) >= 0;
    return '<button type="button" class="laugh" data-laugh="' + escapeHtml(joke.id) + '" aria-pressed="' + on + '" title="Me hizo reír">' +
      'Ja <span class="n">' + (joke.laughs || 0) + "</span></button>";
  }
  function jokeTextHtml(text, lang, tag){
    tag = tag || "p";
    var l = htmlLang(lang);
    return "<" + tag + ' class="joke" dir="auto"' + (l ? ' lang="' + l + '"' : "") + ">" + escapeHtml(text) + "</" + tag + ">";
  }
  function jokeCardHtml(j){
    return '<article class="card">' +
      '<div class="card-head">' +
        '<a class="folio" href="#/chiste/' + escapeHtml(j.id) + '">' + folioFor(j) + "</a>" +
        '<div class="card-tags">' +
          '<a class="tag" href="#/registro?lang=' + j.lang + '">' + escapeHtml(langLabel(j.lang)) + "</a>" +
          '<a class="tag" href="#/registro?cat=' + j.category + '">' + escapeHtml(catLabel(j.category)) + "</a>" +
        "</div>" +
      "</div>" +
      '<a class="joke-link" href="#/chiste/' + escapeHtml(j.id) + '">' + jokeTextHtml(j.text, j.lang) + "</a>" +
      '<div class="card-foot">' +
        '<span class="byline">Registrado por <a href="#/autor/' + escapeHtml(j.authorId) + '">' + escapeHtml(j.authorName) + "</a>" +
          (j.authorCountry ? " · " + escapeHtml(j.authorCountry) : "") + "<br>" + formatDate(j.createdAt) + "</span>" +
        laughBtnHtml(j) +
      "</div>" +
    "</article>";
  }
  function patCardHtml(p){
    return '<article class="card pat">' +
      '<span class="stamp-mark" aria-hidden="true">PATRIMONIO</span>' +
      '<div class="card-head">' +
        '<a class="folio" href="#/patrimonio/' + p.id + '">' + patFolio(p) + "</a>" +
        '<div class="card-tags">' +
          '<a class="tag" href="#/patrimonio?lang=' + p.lang + '">' + escapeHtml(langLabel(p.lang)) + "</a>" +
          '<a class="tag" href="#/patrimonio?cat=' + p.category + '">' + escapeHtml(catLabel(p.category)) + "</a>" +
        "</div>" +
      "</div>" +
      '<a class="joke-link" href="#/patrimonio/' + p.id + '">' + jokeTextHtml(p.text, p.lang) + "</a>" +
      (p.nota ? '<p class="nota"><b>Nota:</b> ' + escapeHtml(p.nota) + "</p>" : "") +
      '<div class="card-foot" style="padding-right:110px"><span class="byline">Autor desconocido · ' + escapeHtml(p.origen) + "</span></div>" +
    "</article>";
  }

  // ---------------------------------------------------------------------
  // router
  // ---------------------------------------------------------------------
  function parseHash(){
    var raw = location.hash.replace(/^#/, "") || "/";
    var qIdx = raw.indexOf("?");
    var path = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
    var params = {};
    if(qIdx >= 0){
      new URLSearchParams(raw.slice(qIdx + 1)).forEach(function(v, k){ params[k] = v; });
    }
    var parts = path.split("/").filter(Boolean);
    return { name: parts[0] || "inicio", arg: parts[1] ? decodeURIComponent(parts[1]) : "", params: params };
  }
  function go(hash){
    if(location.hash === hash) render(); else location.hash = hash;
  }
  function setActiveNav(name){
    Array.prototype.forEach.call(nav.querySelectorAll("[data-nav]"), function(a){
      a.classList.toggle("active", a.getAttribute("data-nav") === name);
    });
  }
  function renderNavAuth(){
    if(currentUser){
      var name = currentProfile && currentProfile.displayName || "Mi perfil";
      navAuth.innerHTML = '<a href="#/autor/' + currentUser.uid + '" data-nav="yo">' + escapeHtml(name) + "</a>";
    } else {
      navAuth.innerHTML = '<a href="#/entrar" data-nav="entrar">Entrar</a>';
    }
  }

  function render(){
    var route = parseHash();
    var token = ++renderToken;
    var navName = route.name;
    if(route.name === "chiste") navName = "registro";
    if(currentUser && route.name === "autor" && route.arg === currentUser.uid) navName = "yo";
    setActiveNav(navName);
    window.scrollTo(0, 0);

    var views = {
      inicio: viewHome,
      registro: viewRegistro,
      patrimonio: route.arg ? viewPatrimonioDetail : viewPatrimonio,
      chiste: viewJoke,
      autor: viewAuthor,
      publicar: viewPublish,
      entrar: viewLogin,
      perfil: viewProfile
    };
    (views[route.name] || viewNotFound)(route, token);
  }
  function stale(token){ return token !== renderToken; }

  function notConfiguredHtml(){
    return '<div class="alert info"><b>El registro todavía no está conectado.</b> Falta completar <span class="mono">firebase-config.js</span> ' +
      "(ver README). Mientras tanto podés recorrer todo el " + '<a href="#/patrimonio">Patrimonio</a>.</div>';
  }
  function requireLogin(){
    afterLogin = location.hash || "#/";
    go("#/entrar");
  }

  // ---------------------------------------------------------------------
  // inicio
  // ---------------------------------------------------------------------
  function viewHome(route, token){
    document.title = "Registro Internacional del Chiste";
    var langsInPat = {};
    PATRIMONIO.forEach(function(p){ langsInPat[p.lang] = true; });
    var dayIndex = Math.floor(Date.now() / 86400000) % PATRIMONIO.length;
    var daily = PATRIMONIO[dayIndex];

    var langChips = LANGS.filter(function(l){ return l.code !== "otro"; }).map(function(l){
      return '<a class="chip" href="#/registro?lang=' + l.code + '">' + escapeHtml(l.label) + "</a>";
    }).join("");

    main.innerHTML =
      '<section class="hero">' +
        "<div>" +
          '<p class="eyebrow">Folio abierto desde 2026</p>' +
          "<h1>Cada chiste tiene un autor. <em>Algunos los tenemos todos.</em></h1>" +
          '<p class="lede">Registrá tus chistes a tu nombre, con fecha y número de folio, en el idioma en que los contás. ' +
            "Y recorré el Patrimonio: los clásicos de tradición oral que no son de nadie porque son de todos.</p>" +
          '<div class="btn-row">' +
            '<a class="btn" href="#/publicar">Registrar un chiste</a>' +
            '<a class="btn ghost" href="#/patrimonio">Ver el Patrimonio</a>' +
          "</div>" +
          '<div class="stats">' +
            "<div><b>" + PATRIMONIO.length + "</b><span>chistes en el Patrimonio</span></div>" +
            "<div><b>" + (LANGS.length - 1) + "</b><span>idiomas en el registro</span></div>" +
            "<div><b>" + CATEGORIES.length + "</b><span>categorías</span></div>" +
          "</div>" +
        "</div>" +
        "<div>" +
          '<p class="eyebrow">Patrimonio del día</p>' +
          patCardHtml(daily) +
        "</div>" +
      "</section>" +

      '<section class="section">' +
        '<div class="section-head"><h2>Últimos registros</h2><a href="#/registro">Ver todo el registro →</a></div>' +
        '<div id="recent">' + (FB_READY ? '<p class="loading">Consultando el libro…</p>' : notConfiguredHtml()) + "</div>" +
      "</section>" +

      '<section class="section">' +
        '<div class="section-head"><h2>Explorar por idioma</h2></div>' +
        '<div class="chips">' + langChips + "</div>" +
      "</section>" +

      '<section class="section">' +
        '<div class="section-head"><h2>Cómo funciona el registro</h2></div>' +
        '<div class="grid steps">' +
          '<div class="panel"><p class="eyebrow">01</p><h3>Escribís tu chiste</h3><p class="muted">Elegís idioma y categoría. Queda a tu nombre, con fecha y hora del servidor: nadie puede antedatar un registro.</p></div>' +
          '<div class="panel"><p class="eyebrow">02</p><h3>Recibís un folio</h3><p class="muted">Cada chiste tiene su certificado con número de folio para compartir o imprimir.</p></div>' +
          '<div class="panel"><p class="eyebrow">03</p><h3>Nadie te lo copia</h3><p class="muted">Si alguien intenta registrar el mismo texto, el registro le muestra que ya es tuyo. Y los clásicos del Patrimonio no se pueden registrar.</p></div>' +
        "</div>" +
      "</section>";

    if(!FB_READY) return;
    db.collection("jokes").orderBy("createdAt", "desc").limit(6).get().then(function(snap){
      if(stale(token)) return;
      var items = snap.docs.map(function(d){ return Object.assign({ id: d.id }, d.data()); });
      document.getElementById("recent").innerHTML = items.length
        ? '<div class="grid">' + items.map(jokeCardHtml).join("") + "</div>"
        : '<div class="empty"><b>El libro está en blanco.</b>Todavía nadie registró un chiste. <a href="#/publicar">Sé el primero</a>.</div>';
    }).catch(function(err){
      if(stale(token)) return;
      document.getElementById("recent").innerHTML = '<div class="alert">' + escapeHtml(friendlyError(err)) + "</div>";
    });
  }

  // ---------------------------------------------------------------------
  // listados (registro y patrimonio comparten filtros)
  // ---------------------------------------------------------------------
  function filtersHtml(base, params, sortOptions){
    return '<div class="toolbar">' +
      '<select data-filter="lang" aria-label="Idioma">' + langOptions(params.lang, true) + "</select>" +
      '<select data-filter="cat" aria-label="Categoría">' + catOptions(params.cat, true) + "</select>" +
      '<select id="sortSel" aria-label="Orden">' + sortOptions + "</select>" +
      '<input class="search" type="search" id="searchBox" placeholder="Buscar en el texto…" aria-label="Buscar" />' +
    "</div>" +
    '<p class="result-meta"><span id="resultCount"></span><button type="button" class="linkbtn" id="randomBtn">Uno al azar</button></p>' +
    '<div id="list"><p class="loading">Consultando el libro…</p></div>';
  }
  function bindFilters(base, params){
    Array.prototype.forEach.call(main.querySelectorAll("[data-filter]"), function(sel){
      sel.addEventListener("change", function(){
        var next = Object.assign({}, params);
        next[sel.getAttribute("data-filter")] = sel.value;
        var qs = new URLSearchParams();
        if(next.lang) qs.set("lang", next.lang);
        if(next.cat) qs.set("cat", next.cat);
        var s = qs.toString();
        go("#/" + base + (s ? "?" + s : ""));
      });
    });
  }
  // Ordena, filtra por búsqueda y pinta. getItems() devuelve la lista base.
  function setupList(items, cardFn, sortFn, randomHref){
    var listEl = document.getElementById("list");
    var countEl = document.getElementById("resultCount");
    var sortSel = document.getElementById("sortSel");
    var searchBox = document.getElementById("searchBox");
    var shown = [];
    function paint(){
      var q = normalizeText(searchBox.value);
      shown = items.filter(function(it){ return !q || normalizeText(it.text).indexOf(q) >= 0; });
      shown = sortFn(shown.slice(), sortSel.value);
      countEl.textContent = plural(shown.length, "chiste", "chistes");
      listEl.innerHTML = shown.length
        ? '<div class="grid">' + shown.map(cardFn).join("") + "</div>"
        : '<div class="empty"><b>Nada por acá.</b>No hay chistes con estos filtros todavía.</div>';
    }
    sortSel.addEventListener("change", paint);
    searchBox.addEventListener("input", paint);
    document.getElementById("randomBtn").addEventListener("click", function(){
      if(!shown.length) return toast("No hay chistes para elegir.");
      go(randomHref(shown[Math.floor(Math.random() * shown.length)]));
    });
    paint();
  }
  function langChipsHtml(base, params, counts){
    var html = '<a class="chip' + (params.lang ? "" : " on") + '" href="#/' + base + (params.cat ? "?cat=" + params.cat : "") + '">Todos</a>';
    LANGS.forEach(function(l){
      if(counts && !counts[l.code]) return;
      var qs = new URLSearchParams();
      qs.set("lang", l.code);
      if(params.cat) qs.set("cat", params.cat);
      html += '<a class="chip' + (params.lang === l.code ? " on" : "") + '" href="#/' + base + "?" + qs.toString() + '">' + escapeHtml(l.label) +
        (counts ? ' <span class="n">' + counts[l.code] + "</span>" : "") + "</a>";
    });
    return '<div class="chips">' + html + "</div>";
  }

  function viewRegistro(route, token){
    var params = route.params;
    document.title = "Registro · Registro Internacional del Chiste";
    main.innerHTML =
      '<p class="eyebrow">El libro de registro</p>' +
      "<h1>Chistes registrados</h1>" +
      '<p class="lede">Chistes publicados a nombre de sus autores, divididos por idioma y categoría.</p>' +
      (FB_READY
        ? '<div style="margin-top:20px">' + langChipsHtml("registro", params, null) + "</div>" +
          filtersHtml("registro", params, '<option value="recent">Más recientes</option><option value="laughs">Más risas</option><option value="old">Más antiguos</option>')
        : '<div style="margin-top:20px">' + notConfiguredHtml() + "</div>");
    if(!FB_READY) return;
    bindFilters("registro", params);

    // Solo filtros de igualdad (no requieren índices compuestos); el orden se
    // aplica en el navegador.
    var q = db.collection("jokes");
    if(params.lang) q = q.where("lang", "==", params.lang);
    if(params.cat) q = q.where("category", "==", params.cat);
    if(!params.lang && !params.cat) q = q.orderBy("createdAt", "desc");
    q.limit(300).get().then(function(snap){
      if(stale(token)) return;
      var items = snap.docs.map(function(d){ return Object.assign({ id: d.id }, d.data()); });
      setupList(items, jokeCardHtml, function(list, mode){
        function t(j){ var d = toDate(j.createdAt); return d ? d.getTime() : Date.now(); }
        if(mode === "laughs") return list.sort(function(a, b){ return (b.laughs || 0) - (a.laughs || 0) || t(b) - t(a); });
        if(mode === "old") return list.sort(function(a, b){ return t(a) - t(b); });
        return list.sort(function(a, b){ return t(b) - t(a); });
      }, function(j){ return "#/chiste/" + j.id; });
    }).catch(function(err){
      if(stale(token)) return;
      document.getElementById("list").innerHTML = '<div class="alert">' + escapeHtml(friendlyError(err)) + "</div>";
    });
  }

  function viewPatrimonio(route){
    var params = route.params;
    document.title = "Patrimonio · Registro Internacional del Chiste";
    var counts = {};
    PATRIMONIO.forEach(function(p){ counts[p.lang] = (counts[p.lang] || 0) + 1; });
    main.innerHTML =
      '<p class="eyebrow">Patrimonio de la humanidad risueña</p>' +
      "<h1>Los clásicos sin autor</h1>" +
      '<p class="lede">Chistes de tradición oral que pasaron de boca en boca hasta perder a su autor. No se pueden registrar a nombre de nadie: si alguien lo intenta, el registro lo rechaza.</p>' +
      '<div style="margin-top:20px">' + langChipsHtml("patrimonio", params, counts) + "</div>" +
      filtersHtml("patrimonio", params, '<option value="folio">Por folio</option><option value="lang">Por idioma</option>');
    bindFilters("patrimonio", params);
    var items = PATRIMONIO.filter(function(p){
      return (!params.lang || p.lang === params.lang) && (!params.cat || p.category === params.cat);
    });
    setupList(items, patCardHtml, function(list, mode){
      if(mode === "lang") return list.sort(function(a, b){ return langLabel(a.lang).localeCompare(langLabel(b.lang)) || a.id.localeCompare(b.id); });
      return list.sort(function(a, b){ return a.id.localeCompare(b.id); });
    }, function(p){ return "#/patrimonio/" + p.id; });
  }

  // ---------------------------------------------------------------------
  // certificados
  // ---------------------------------------------------------------------
  function sealSvg(){
    return '<svg class="seal" aria-hidden="true"><use href="#seal" /></svg>';
  }
  function viewPatrimonioDetail(route){
    var p = findPatrimonio(route.arg);
    if(!p) return viewNotFound();
    document.title = patFolio(p) + " · Patrimonio";
    main.innerHTML =
      '<div class="cert pat"><div class="cert-inner">' +
        '<div class="cert-top">' +
          '<div><p class="eyebrow">Ficha de Patrimonio</p><h1>Chiste de tradición oral</h1></div>' +
          '<div class="cert-folio"><span>Folio</span><b>' + patFolio(p) + "</b></div>" +
        "</div>" +
        jokeTextHtml(p.text, p.lang, "blockquote") +
        (p.nota ? '<p class="nota"><b>Nota:</b> ' + escapeHtml(p.nota) + "</p>" : "") +
        '<div class="cert-body" style="margin-top:20px">' +
          "<p>Se deja constancia de que el chiste arriba transcripto, en idioma <strong>" + escapeHtml(langLabel(p.lang)) + "</strong> y de la categoría <strong>" +
          escapeHtml(catLabel(p.category)) + "</strong>, forma parte del <strong>Patrimonio</strong> de este registro. " +
          "Procedencia: <strong>" + escapeHtml(p.origen) + "</strong>. Autor: <strong>desconocido</strong>.</p>" +
          "<p>Por su carácter de bien común, no puede ser registrado a nombre de ninguna persona.</p>" +
        "</div>" +
        '<div class="cert-sign"><div class="line">Registro Internacional del Chiste</div>' + sealSvg() + "</div>" +
      "</div></div>" +
      '<div class="cert-actions">' +
        '<a class="btn ghost" href="#/patrimonio">← Volver al Patrimonio</a>' +
        '<div class="btn-row">' +
          '<button type="button" class="btn ghost" data-share>Compartir</button>' +
          '<button type="button" class="btn ghost" data-print>Imprimir ficha</button>' +
        "</div>" +
      "</div>";
  }

  function viewJoke(route, token){
    if(!FB_READY){ main.innerHTML = notConfiguredHtml(); return; }
    main.innerHTML = '<p class="loading">Buscando el folio…</p>';
    db.collection("jokes").doc(route.arg).get().then(function(doc){
      if(stale(token)) return;
      if(!doc.exists) return viewNotFound();
      var j = Object.assign({ id: doc.id }, doc.data());
      var canDelete = currentUser && (currentUser.uid === j.authorId || isAdmin());
      var fresh = route.params.nuevo === "1";
      document.title = folioFor(j) + " · Registro Internacional del Chiste";
      main.innerHTML =
        (fresh ? '<div class="fresh" role="status">¡Registrado! Este es el certificado de tu chiste. Guardá el link o imprimilo.</div>' : "") +
        '<div class="cert"><div class="cert-inner">' +
          '<div class="cert-top">' +
            '<div><p class="eyebrow">Certificado de registro</p><h1>Chiste registrado</h1></div>' +
            '<div class="cert-folio"><span>Folio</span><b>' + folioFor(j) + "</b></div>" +
          "</div>" +
          jokeTextHtml(j.text, j.lang, "blockquote") +
          '<div class="cert-body">' +
            "<p>Se certifica que el chiste arriba transcripto fue registrado a nombre de <strong>" + escapeHtml(j.authorName) + "</strong>" +
            (j.authorCountry ? " (" + escapeHtml(j.authorCountry) + ")" : "") +
            " el día <strong>" + formatDateTime(j.createdAt) + "</strong>, en idioma <strong>" + escapeHtml(langLabel(j.lang)) +
            "</strong> y en la categoría <strong>" + escapeHtml(catLabel(j.category)) + "</strong>.</p>" +
            "<p>A la fecha, " + plural(j.laughs || 0, "persona declaró", "personas declararon") + " haberse reído.</p>" +
          "</div>" +
          '<div class="cert-sign"><div class="line">El Registrador</div>' + sealSvg() + "</div>" +
        "</div></div>" +
        '<div class="cert-actions">' +
          '<div class="btn-row">' + laughBtnHtml(j) +
            '<a class="btn ghost" href="#/autor/' + escapeHtml(j.authorId) + '">Más de ' + escapeHtml(j.authorName) + "</a>" +
          "</div>" +
          '<div class="btn-row">' +
            '<button type="button" class="btn ghost" data-share>Compartir</button>' +
            '<button type="button" class="btn ghost" data-print>Imprimir certificado</button>' +
            (canDelete ? '<button type="button" class="btn danger" data-delete="' + escapeHtml(j.id) + '" data-fp="' + escapeHtml(j.fingerprint) + '">Borrar</button>' : "") +
          "</div>" +
        "</div>";
    }).catch(function(err){
      if(stale(token)) return;
      main.innerHTML = '<div class="alert">' + escapeHtml(friendlyError(err)) + "</div>";
    });
  }

  // ---------------------------------------------------------------------
  // autor
  // ---------------------------------------------------------------------
  function viewAuthor(route, token){
    if(!FB_READY){ main.innerHTML = notConfiguredHtml(); return; }
    var uid = route.arg;
    main.innerHTML = '<p class="loading">Buscando al autor…</p>';
    Promise.all([
      db.collection("users").doc(uid).get(),
      db.collection("jokes").where("authorId", "==", uid).limit(500).get()
    ]).then(function(res){
      if(stale(token)) return;
      if(!res[0].exists) return viewNotFound();
      var u = res[0].data();
      var jokes = res[1].docs.map(function(d){ return Object.assign({ id: d.id }, d.data()); });
      jokes.sort(function(a, b){
        var ta = toDate(a.createdAt), tb = toDate(b.createdAt);
        return (tb ? tb.getTime() : 0) - (ta ? ta.getTime() : 0);
      });
      var laughs = jokes.reduce(function(s, j){ return s + (j.laughs || 0); }, 0);
      var isMe = currentUser && currentUser.uid === uid;
      document.title = u.displayName + " · Registro Internacional del Chiste";
      main.innerHTML =
        '<div class="author-head">' +
          '<span class="avatar" aria-hidden="true">' + escapeHtml(initials(u.displayName)) + "</span>" +
          "<div><p class=\"eyebrow\">Autor registrado</p><h1>" + escapeHtml(u.displayName) + "</h1>" +
            '<p class="muted">' + (u.country ? escapeHtml(u.country) + " · " : "") + plural(jokes.length, "chiste registrado", "chistes registrados") +
            " · " + plural(laughs, "risa", "risas") + "</p></div>" +
        "</div>" +
        (u.bio ? '<p class="lede">' + escapeHtml(u.bio) + "</p>" : "") +
        (isMe ? '<div class="btn-row" style="margin-top:16px"><a class="btn" href="#/publicar">Registrar un chiste</a><a class="btn ghost" href="#/perfil">Editar perfil</a></div>' : "") +
        '<section class="section"><div class="section-head"><h2>Chistes a su nombre</h2></div>' +
          (jokes.length
            ? '<div class="grid">' + jokes.map(jokeCardHtml).join("") + "</div>"
            : '<div class="empty"><b>Sin registros todavía.</b>' + (isMe ? '<a href="#/publicar">Registrá tu primer chiste</a>.' : "") + "</div>") +
        "</section>";
    }).catch(function(err){
      if(stale(token)) return;
      main.innerHTML = '<div class="alert">' + escapeHtml(friendlyError(err)) + "</div>";
    });
  }

  // ---------------------------------------------------------------------
  // publicar
  // ---------------------------------------------------------------------
  function viewPublish(){
    document.title = "Registrar un chiste";
    if(!FB_READY){ main.innerHTML = notConfiguredHtml(); return; }
    if(!authResolved){ main.innerHTML = '<p class="loading">Un momento…</p>'; return; }
    if(!currentUser) return requireLogin();
    if(!currentProfile){ afterLogin = "#/publicar"; return go("#/perfil"); }

    main.innerHTML =
      '<div class="narrow">' +
        '<p class="eyebrow">Nuevo registro</p>' +
        "<h1>Registrar un chiste</h1>" +
        '<p class="lede">Va a quedar a nombre de <b>' + escapeHtml(currentProfile.displayName) + "</b>, con la fecha de hoy. Una vez registrado, el texto no se puede editar.</p>" +
        '<form class="panel" id="publishForm" style="margin-top:20px" novalidate>' +
          '<div id="formMsg"></div>' +
          '<label class="field"><span>El chiste</span>' +
            '<textarea class="joke-input" name="text" dir="auto" maxlength="' + MAX_LEN + '" required placeholder="—¿Qué le dijo…?&#10;—…"></textarea>' +
            '<small><span id="charCount">0</span> / ' + MAX_LEN + " caracteres. Usá saltos de línea para los diálogos.</small></label>" +
          '<div class="form-grid">' +
            '<label class="field"><span>Idioma</span><select name="lang" required>' + langOptions(guessLang(), false) + "</select></label>" +
            '<label class="field"><span>Categoría</span><select name="category" required>' + catOptions("", false) + "</select></label>" +
          "</div>" +
          '<label class="check"><input type="checkbox" name="declare" required /> <span>Declaro que este chiste es de mi autoría, o que lo publico de buena fe sin conocer otro autor, y que no es un clásico de tradición oral.</span></label>' +
          '<button class="btn" type="submit">Registrar a mi nombre</button>' +
        "</form>" +
      "</div>";

    var form = document.getElementById("publishForm");
    var msg = document.getElementById("formMsg");
    var counter = document.getElementById("charCount");
    form.text.addEventListener("input", function(){ counter.textContent = form.text.value.length; });

    form.addEventListener("submit", function(e){
      e.preventDefault();
      msg.innerHTML = "";
      var text = form.text.value.replace(/\r\n/g, "\n").trim();
      var lang = form.lang.value;
      var category = form.category.value;
      function fail(html){ msg.innerHTML = '<div class="alert">' + html + "</div>"; msg.scrollIntoView({ block:"center" }); }

      if(!normalizeText(text)) return fail("Escribí el chiste.");
      if(text.length > MAX_LEN) return fail("El chiste es demasiado largo (máximo " + MAX_LEN + " caracteres).");
      if(!category) return fail("Elegí una categoría.");
      if(!form.declare.checked) return fail("Tenés que aceptar la declaración de autoría.");

      var pat = findPatrimonioMatch(text);
      if(pat){
        return fail("Este chiste es <b>Patrimonio</b> (folio " + patFolio(pat) + ") y no se puede registrar a nombre de nadie. " +
          '<a href="#/patrimonio/' + pat.id + '">Ver la ficha</a>.');
      }

      var btn = form.querySelector("button[type=submit]");
      btn.disabled = true; btn.textContent = "Registrando…";
      function restore(){ btn.disabled = false; btn.textContent = "Registrar a mi nombre"; }

      var fingerprint;
      sha256Hex(normalizeText(text).replace(/ /g, "")).then(function(fp){
        fingerprint = fp;
        return db.collection("huellas").doc(fp).get();
      }).then(function(existing){
        if(existing.exists){
          var h = existing.data();
          restore();
          return fail("Este chiste ya está registrado a nombre de <b>" + escapeHtml(h.authorName) + "</b>. " +
            '<a href="#/chiste/' + escapeHtml(h.jokeId) + '">Ver el certificado</a>.');
        }
        var jokeRef = db.collection("jokes").doc();
        var batch = db.batch();
        batch.set(jokeRef, {
          text: text,
          lang: lang,
          category: category,
          authorId: currentUser.uid,
          authorName: currentProfile.displayName,
          authorCountry: currentProfile.country || "",
          fingerprint: fingerprint,
          laughs: 0,
          createdAt: FieldValue.serverTimestamp()
        });
        batch.set(db.collection("huellas").doc(fingerprint), {
          jokeId: jokeRef.id,
          authorId: currentUser.uid,
          authorName: currentProfile.displayName,
          createdAt: FieldValue.serverTimestamp()
        });
        return batch.commit().then(function(){
          go("#/chiste/" + jokeRef.id + "?nuevo=1");
        });
      }).catch(function(err){
        restore();
        // Si otra persona registró el mismo texto en el mismo instante, la regla
        // de /huellas rechaza el batch.
        fail(err && err.code === "permission-denied"
          ? "No se pudo registrar: puede que alguien haya registrado este mismo chiste recién. Probá de nuevo."
          : escapeHtml(friendlyError(err)));
      });
    });
  }

  // ---------------------------------------------------------------------
  // entrar / registrarse
  // ---------------------------------------------------------------------
  function viewLogin(route){
    document.title = "Entrar · Registro Internacional del Chiste";
    if(!FB_READY){ main.innerHTML = notConfiguredHtml(); return; }
    if(currentUser){ return go(afterLogin || "#/autor/" + currentUser.uid); }
    var signup = route.params.modo === "nuevo";
    main.innerHTML =
      '<div class="narrow" style="max-width:460px">' +
        '<p class="eyebrow">' + (signup ? "Alta de autor" : "Ventanilla de autores") + "</p>" +
        "<h1>" + (signup ? "Crear cuenta" : "Entrar") + "</h1>" +
        '<p class="lede">' + (signup ? "Con una cuenta podés registrar chistes a tu nombre y reírte de los ajenos." : "Entrá para registrar chistes y reírte de los de otros.") + "</p>" +
        '<form class="panel" id="authForm" style="margin-top:20px">' +
          '<div id="formMsg"></div>' +
          (signup
            ? '<label class="field"><span>Nombre de autor</span><input type="text" name="displayName" maxlength="60" required autocomplete="name" /><small>Así va a figurar en tus certificados.</small></label>' +
              '<label class="field"><span>País <span class="muted">(opcional)</span></span><input type="text" name="country" maxlength="60" autocomplete="country-name" /></label>'
            : "") +
          '<label class="field"><span>Email</span><input type="email" name="email" required autocomplete="email" /></label>' +
          '<label class="field"><span>Contraseña</span><input type="password" name="password" required minlength="6" autocomplete="' + (signup ? "new-password" : "current-password") + '" /></label>' +
          '<div class="btn-row" style="justify-content:space-between;align-items:center">' +
            '<button class="btn" type="submit">' + (signup ? "Crear cuenta" : "Entrar") + "</button>" +
            (signup ? "" : '<button type="button" class="linkbtn" id="resetBtn">Olvidé mi contraseña</button>') +
          "</div>" +
        "</form>" +
        '<p class="muted" style="margin-top:16px">' +
          (signup ? '¿Ya tenés cuenta? <a href="#/entrar">Entrá</a>.' : '¿Primera vez? <a href="#/entrar?modo=nuevo">Creá tu cuenta de autor</a>.') +
        "</p>" +
      "</div>";

    var form = document.getElementById("authForm");
    var msg = document.getElementById("formMsg");
    function fail(text){ msg.innerHTML = '<div class="alert">' + escapeHtml(text) + "</div>"; }

    form.addEventListener("submit", function(e){
      e.preventDefault();
      var btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      var email = form.email.value.trim();
      var password = form.password.value;
      var p;
      if(signup){
        var displayName = form.displayName.value.trim();
        var country = form.country.value.trim();
        if(!displayName){ btn.disabled = false; return fail("Poné tu nombre de autor."); }
        // onAuthStateChanged espera a pendingSignup antes de leer el perfil.
        p = pendingSignup = auth.createUserWithEmailAndPassword(email, password).then(function(cred){
          return db.collection("users").doc(cred.user.uid).set({
            displayName: displayName, country: country, bio: "", laughedJokeIds: [], createdAt: FieldValue.serverTimestamp()
          });
        });
        p.catch(function(){}).then(function(){ pendingSignup = null; });
      } else {
        p = auth.signInWithEmailAndPassword(email, password);
      }
      p.catch(function(err){ btn.disabled = false; fail(friendlyError(err)); });
      // La navegación la hace onAuthStateChanged.
    });

    var resetBtn = document.getElementById("resetBtn");
    if(resetBtn) resetBtn.addEventListener("click", function(){
      var email = form.email.value.trim();
      if(!email) return fail("Escribí tu email arriba y volvé a tocar «Olvidé mi contraseña».");
      auth.sendPasswordResetEmail(email).then(function(){
        msg.innerHTML = '<div class="alert info">Te mandamos un email para elegir una contraseña nueva.</div>';
      }).catch(function(err){ fail(friendlyError(err)); });
    });
  }

  // ---------------------------------------------------------------------
  // perfil
  // ---------------------------------------------------------------------
  function viewProfile(){
    document.title = "Mi perfil · Registro Internacional del Chiste";
    if(!FB_READY){ main.innerHTML = notConfiguredHtml(); return; }
    if(!authResolved){ main.innerHTML = '<p class="loading">Un momento…</p>'; return; }
    if(!currentUser) return requireLogin();
    var p = currentProfile || {};
    main.innerHTML =
      '<div class="narrow" style="max-width:520px">' +
        '<p class="eyebrow">Ficha de autor</p>' +
        "<h1>" + (currentProfile ? "Mi perfil" : "Completá tu ficha") + "</h1>" +
        '<form class="panel" id="profileForm" style="margin-top:20px">' +
          '<div id="formMsg"></div>' +
          '<label class="field"><span>Nombre de autor</span><input type="text" name="displayName" maxlength="60" required value="' + escapeHtml(p.displayName || "") + '" />' +
            "<small>Los chistes ya registrados conservan el nombre con el que se registraron.</small></label>" +
          '<label class="field"><span>País</span><input type="text" name="country" maxlength="60" value="' + escapeHtml(p.country || "") + '" /></label>' +
          '<label class="field"><span>Sobre mí</span><textarea name="bio" rows="3" maxlength="300">' + escapeHtml(p.bio || "") + "</textarea></label>" +
          '<div class="btn-row" style="justify-content:space-between">' +
            '<button class="btn" type="submit">Guardar</button>' +
            '<button type="button" class="btn ghost" id="logoutBtn">Cerrar sesión</button>' +
          "</div>" +
        "</form>" +
        '<p class="muted" style="margin-top:12px">Sesión iniciada como ' + escapeHtml(currentUser.email) + ".</p>" +
      "</div>";

    var form = document.getElementById("profileForm");
    form.addEventListener("submit", function(e){
      e.preventDefault();
      var displayName = form.displayName.value.trim();
      if(!displayName){
        document.getElementById("formMsg").innerHTML = '<div class="alert">Poné tu nombre de autor.</div>';
        return;
      }
      var data = { displayName: displayName, country: form.country.value.trim(), bio: form.bio.value.trim() };
      if(!currentProfile){ data.laughedJokeIds = []; data.createdAt = FieldValue.serverTimestamp(); }
      db.collection("users").doc(currentUser.uid).set(data, { merge: true }).then(function(){
        currentProfile = Object.assign({}, currentProfile || {}, data);
        renderNavAuth();
        toast("Perfil guardado.");
        var next = afterLogin; afterLogin = null;
        go(next || "#/autor/" + currentUser.uid);
      }).catch(function(err){
        document.getElementById("formMsg").innerHTML = '<div class="alert">' + escapeHtml(friendlyError(err)) + "</div>";
      });
    });
    document.getElementById("logoutBtn").addEventListener("click", function(){
      auth.signOut().then(function(){ go("#/"); });
    });
  }

  function viewNotFound(){
    document.title = "Folio inexistente";
    main.innerHTML = '<div class="empty"><b>Folio inexistente.</b>No encontramos esa página en el libro. <a href="#/">Volver al inicio</a>.</div>';
  }

  // ---------------------------------------------------------------------
  // acciones (delegadas)
  // ---------------------------------------------------------------------
  function toggleLaugh(btn){
    if(!FB_READY) return;
    if(!currentUser){ toast("Entrá para poder reírte oficialmente."); return requireLogin(); }
    if(!currentProfile){ afterLogin = location.hash; return go("#/perfil"); }
    if(btn.disabled) return;
    var id = btn.getAttribute("data-laugh");
    var on = laughedIds().indexOf(id) >= 0;
    var countEl = btn.querySelector(".n");
    var prev = parseInt(countEl.textContent, 10) || 0;
    btn.disabled = true;
    // Actualización optimista.
    btn.setAttribute("aria-pressed", String(!on));
    countEl.textContent = prev + (on ? -1 : 1);
    if(!on){ btn.classList.remove("pop"); void btn.offsetWidth; btn.classList.add("pop"); }

    var batch = db.batch();
    batch.update(db.collection("jokes").doc(id), { laughs: FieldValue.increment(on ? -1 : 1) });
    batch.update(db.collection("users").doc(currentUser.uid), {
      laughedJokeIds: on ? FieldValue.arrayRemove(id) : FieldValue.arrayUnion(id)
    });
    batch.commit().then(function(){
      var ids = laughedIds().filter(function(x){ return x !== id; });
      if(!on) ids.push(id);
      currentProfile.laughedJokeIds = ids;
    }).catch(function(err){
      btn.setAttribute("aria-pressed", String(on));
      countEl.textContent = prev;
      toast(friendlyError(err));
    }).then(function(){ btn.disabled = false; });
  }

  function deleteJoke(btn){
    if(!confirm("¿Borrar este chiste del registro? El folio deja de existir y el texto queda libre para que otra persona lo registre.")) return;
    var id = btn.getAttribute("data-delete");
    var fp = btn.getAttribute("data-fp");
    btn.disabled = true;
    var batch = db.batch();
    batch.delete(db.collection("jokes").doc(id));
    if(fp) batch.delete(db.collection("huellas").doc(fp));
    batch.commit().then(function(){
      toast("Chiste borrado del registro.");
      go("#/registro");
    }).catch(function(err){
      btn.disabled = false;
      toast(friendlyError(err));
    });
  }

  function share(){
    var url = location.href.replace(/[?&]nuevo=1/, "");
    if(navigator.share){
      navigator.share({ title: document.title, url: url }).catch(function(){});
    } else if(navigator.clipboard){
      navigator.clipboard.writeText(url).then(function(){ toast("Link copiado."); }, function(){ toast(url); });
    } else {
      toast(url);
    }
  }

  main.addEventListener("click", function(e){
    var t = e.target.closest("[data-laugh],[data-delete],[data-share],[data-print]");
    if(!t) return;
    if(t.hasAttribute("data-laugh")) toggleLaugh(t);
    else if(t.hasAttribute("data-delete")) deleteJoke(t);
    else if(t.hasAttribute("data-share")) share();
    else if(t.hasAttribute("data-print")) window.print();
  });

  window.addEventListener("hashchange", render);

  // ---------------------------------------------------------------------
  // arranque
  // ---------------------------------------------------------------------
  if(!FB_READY){
    renderNavAuth();
    render();
    return;
  }
  auth.onAuthStateChanged(function(user){
    currentUser = user;
    currentProfile = null;
    var load = user
      ? Promise.resolve(pendingSignup).catch(function(){}).then(function(){
          return db.collection("users").doc(user.uid).get();
        }).then(function(doc){
          currentProfile = doc.exists ? doc.data() : null;
        }).catch(function(){})
      : Promise.resolve();
    load.then(function(){
      authResolved = true;
      renderNavAuth();
      var route = parseHash().name;
      if(user && route === "entrar"){
        var next = afterLogin; afterLogin = null;
        go(currentProfile ? (next || "#/autor/" + user.uid) : "#/perfil");
      } else {
        render();
      }
    });
  });
})();
