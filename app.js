// =============================================================================
// CONFIGURATION — a completer avec vos propres identifiants
// =============================================================================

// 1) Supabase : Dashboard Supabase > Project Settings > API
//    -> copiez "Project URL" et la cle "anon public"
const SUPABASE_URL = "https://ojmfisxyicgrcucdncja.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qbWZpc3h5aWNncmN1Y2RuY2phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2ODk5MDAsImV4cCI6MjEwMTI2NTkwMH0.Zwyn5_jmiTWTrcQ-yYidf5xHjSuumyGTMVq6OOjUj4s";

// 2) Adsterra : creez un compte sur adsterra.com, ajoutez votre site, attendez
//    l'approbation, puis creez un "Ad Unit" (Social Bar, Banner ou Native).
//    Adsterra vous donne un extrait de code <script>...</script> a coller.
//    -> Collez-le dans la fonction injectAdsterra() ci-dessous, a la place
//    du commentaire. Adsterra ne fournit pas d'evenement "pub terminee" :
//    la pub s'affiche simplement pendant que notre propre minuteur compte
//    le temps a regarder avant de debloquer la recompense.
// 2) Adsterra : deux formats sont geres ici.
//
//    a) POPUNDER (deja configure ci-dessous) : simple, mais AUCUNE
//       verification n'est possible avec ce format. Adsterra ne renvoie
//       aucun signal "pub affichee", et le popunder s'ouvre expres sans
//       voler le focus de la page principale.
//
//    b) DIRECT LINK (recommande si vous voulez une vraie verification) :
//       creez un "Ad Unit" de type "Direct Link" dans votre dashboard
//       Adsterra, collez son URL ci-dessous. On l'ouvre alors nous-memes
//       avec window.open(), ce qui permet de verifier que ca a bien
//       fonctionne ET de detecter le retour de l'utilisateur sur l'onglet.
const ADSTERRA_DIRECT_LINK_URL = "https://www.effectivecpmnetwork.com/b9s4q78k8?key=c72b0e4caa6d14011fdbb092f399580e";

function injectAdsterra() {
  const slot = document.getElementById("adsterraSlot");
  slot.innerHTML = "";

  // On retire le script precedent avant d'en ajouter un nouveau, pour eviter
  // d'empiler plusieurs Popunder si l'utilisateur enchaine les visionnages.
  const old = document.getElementById("adsterra-script");
  if (old) old.remove();

  // Popunder Adsterra — se declenche au clic sur "Regarder" (appel de
  // injectAdsterra() depuis openWatch ci-dessous).
  const script = document.createElement("script");
  script.id = "adsterra-script";
  script.src = "https://pl30653477.effectivecpmnetwork.com/ff/cb/ee/ffcbee00d7ebb42dc4ab275d61e677cf.js";
  document.body.appendChild(script);

  slot.textContent = "Publicité chargée en arrière-plan (nouvel onglet).";
}

// =============================================================================
// Verification "pub vue" (uniquement possible en mode Direct Link)
// =============================================================================
let adVerified = false;

function triggerAdAndVerify() {
  adVerified = false;
  const slot = document.getElementById("adsterraSlot");
  const useDirectLink = ADSTERRA_DIRECT_LINK_URL && ADSTERRA_DIRECT_LINK_URL.trim() !== "";

  if (useDirectLink) {
    const win = window.open(ADSTERRA_DIRECT_LINK_URL, "_blank");
    if (!win) {
      slot.textContent = "⚠️ Pop-up bloquée par votre navigateur. Autorisez les pop-ups pour ce site puis réessayez.";
      return;
    }
    slot.textContent = "Publicité ouverte dans un nouvel onglet — regardez-la puis revenez ici.";
    window.addEventListener("focus", onReturnFromAd, { once: true });
  } else {
    // Popunder : pas de verification possible avec ce format, on ne bloque
    // donc pas la validation dessus (seul le minuteur, verifie cote serveur,
    // protege contre la fraude).
    injectAdsterra();
    adVerified = true;
  }
  refreshConfirmButtonState();
}

function onReturnFromAd() {
  adVerified = true;
  const slot = document.getElementById("adsterraSlot");
  slot.textContent = "✅ Retour détecté après consultation de la publicité.";
  refreshConfirmButtonState();
}

function refreshConfirmButtonState() {
  const btn = document.getElementById("confirmBtn");
  if (!btn) return;
  const timerDone = watchElapsed >= (currentAd?.duration_seconds || 0);
  if (timerDone && adVerified) {
    btn.disabled = false;
    btn.textContent = "Valider et encaisser";
  } else if (timerDone && !adVerified) {
    btn.disabled = true;
    btn.textContent = "Revenez sur cet onglet après avoir vu la pub";
  }
}

// =============================================================================
// Devises et methodes de retrait (doit correspondre a supabase-schema.sql)
// =============================================================================
const CURRENCY_MAP = {
  XOF: { code: "XOF", label: "Franc CFA", locale: "fr-FR", min: 500, methods: ["flooz", "tmoney", "orange", "wave", "mtn"] },
  EUR: { code: "EUR", label: "Euro", locale: "fr-FR", min: 5, methods: ["paypal", "virement"] },
  USD: { code: "USD", label: "Dollar americain", locale: "en-US", min: 5, methods: ["paypal", "virement"] },
};
const METHOD_LABELS = {
  flooz: "Flooz (Moov Africa)", tmoney: "T-Money (Togocom)", orange: "Orange Money",
  wave: "Wave", mtn: "MTN Mobile Money", paypal: "PayPal", virement: "Virement bancaire",
};
const DESTINATION_LABELS = {
  flooz: "Numéro de téléphone", tmoney: "Numéro de téléphone", orange: "Numéro de téléphone",
  wave: "Numéro de téléphone", mtn: "Numéro de téléphone",
  paypal: "Adresse email PayPal", virement: "IBAN / RIB",
};

let currentCurrency = CURRENCY_MAP.XOF;

// Capture le "?ref=<id>" present dans l'URL (lien d'invitation) des le
// chargement de la page, pour pouvoir l'envoyer au moment de l'inscription.
const REFERRAL_ID = new URLSearchParams(window.location.search).get("ref") || "";

const DEMO_AD = Object.freeze({
  id: "demo",
  title: "Publicité de démonstration",
  description: "Cliquez pour tester le flux complet de visionnage.",
  video_url: "https://www.w3schools.com/html/mov_bbb.mp4",
  reward_amount: 500,
  duration_seconds: 5,
  active: true,
  is_demo: true,
});

function fmtMoney(n) {
  try {
    return new Intl.NumberFormat(currentCurrency.locale, {
      style: "currency", currency: currentCurrency.code,
      maximumFractionDigits: currentCurrency.code === "XOF" ? 0 : 2,
    }).format(n);
  } catch {
    return n + " " + currentCurrency.code;
  }
}

function fmtXOF(n) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) + " XOF";
}

const WITHDRAW_RULES = {
  watchedAds: 50,
  bonusPerAd: 50,
  minBalance: 10000,
  referrals: 8,
};

function getInviteLink() {
  if (!session?.user?.id) return "";
  const baseUrl = window.location.origin + window.location.pathname;
  const url = new URL(baseUrl);
  url.searchParams.set("ref", session.user.id);
  return url.toString();
}

function renderInviteLink() {
  const input = document.getElementById("inviteLink");
  if (!input) return;
  input.value = getInviteLink();
}

async function copyInviteLink() {
  const input = document.getElementById("inviteLink");
  const msg = document.getElementById("inviteOk");
  if (!input) return;
  if (!input.value) {
    msg.textContent = "Connexion requise pour générer un lien.";
    return;
  }

  try {
    await navigator.clipboard.writeText(input.value);
    msg.textContent = "Lien copié avec succès !";
  } catch {
    input.select();
    document.execCommand("copy");
    msg.textContent = "Lien copié avec succès !";
  }
}

function renderWithdrawProgress({ watchedCount = 0, balance = 0, referralCount = 0 }) {
  const el = document.getElementById("wdProgress");
  if (!el) return;

  const bonusEarned = watchedCount * WITHDRAW_RULES.bonusPerAd;
  const watchedDone = watchedCount >= WITHDRAW_RULES.watchedAds;
  const balanceDone = balance >= WITHDRAW_RULES.minBalance;
  const referralsDone = referralCount >= WITHDRAW_RULES.referrals;
  const isReady = watchedDone && balanceDone && referralsDone;

  el.innerHTML = `
    <div style="display:grid;gap:8px;">
      <div style="display:flex;justify-content:space-between;gap:8px;"><span>Publicités regardées</span><strong>${watchedCount}/${WITHDRAW_RULES.watchedAds}</strong></div>
      <div style="display:flex;justify-content:space-between;gap:8px;"><span>Bonus accumulé</span><strong>${bonusEarned} FCFA</strong></div>
      <div style="display:flex;justify-content:space-between;gap:8px;"><span>Solde minimum</span><strong>${fmtXOF(balance)} / ${fmtXOF(WITHDRAW_RULES.minBalance)}</strong></div>
      <div style="display:flex;justify-content:space-between;gap:8px;"><span>Invitations</span><strong>${referralCount}/${WITHDRAW_RULES.referrals}</strong></div>
      <div style="margin-top:4px; font-weight:700; color:${isReady ? "var(--success)" : "var(--muted)"};">${isReady ? "✅ Prêt pour un retrait" : "⏳ Encore quelques étapes à compléter"}</div>
    </div>`;
}

// =============================================================================
// Supabase client + etat
// =============================================================================
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let session = null;
let profile = null;
let currentAd = null;
let watchId = null;
let watchTimer = null;
let watchElapsed = 0;

// =============================================================================
// Navigation
// =============================================================================
function showView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById("view-" + name).classList.add("active");
  if (name === "dashboard") loadDashboard();
  if (name === "withdraw") loadWithdraw();
  if (name === "admin") loadAdmin();
}

function switchAuthTab(tab) {
  document.getElementById("tabLogin").classList.toggle("active", tab === "login");
  document.getElementById("tabRegister").classList.toggle("active", tab === "register");
  document.getElementById("loginForm").style.display = tab === "login" ? "block" : "none";
  document.getElementById("registerForm").style.display = tab === "register" ? "block" : "none";
}

// =============================================================================
// Lecteur video universel : YouTube / Vimeo / fichier direct
// =============================================================================
function renderVideoPlayer(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace("www.", "");

    if (host === "youtu.be" || host.endsWith("youtube.com")) {
      let videoId = "";
      if (host === "youtu.be") videoId = u.pathname.slice(1);
      else if (u.searchParams.get("v")) videoId = u.searchParams.get("v");
      else if (u.pathname.startsWith("/embed/")) videoId = u.pathname.split("/embed/")[1];
      else if (u.pathname.startsWith("/shorts/")) videoId = u.pathname.split("/shorts/")[1];
      if (videoId) {
        return `<iframe width="100%" height="280" style="border:0;border-radius:10px;" src="https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&rel=0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
      }
    }
    if (host.endsWith("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop();
      if (id) {
        return `<iframe width="100%" height="280" style="border:0;border-radius:10px;" src="https://player.vimeo.com/video/${id}?autoplay=1&muted=1" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
      }
    }
  } catch (e) { /* URL invalide -> on retombe sur la lecture directe */ }

  return `<video controls autoplay muted playsinline style="width:100%;border-radius:10px;background:#000;">
      <source src="${url}">
    </video>
    <p style="font-size:0.8rem;color:var(--muted);margin-top:6px;">
      La vidéo ne s'affiche pas ? <a href="${url}" target="_blank" rel="noopener">Ouvrir le lien directement</a>.
    </p>`;
}

// =============================================================================
// Authentification
// =============================================================================
const DEMO_LOGIN_EMAIL = "demo@demo.com";
const DEMO_LOGIN_PASSWORD = "demo1234";

function setDemoSession(email, name = "Utilisateur démo") {
  session = {
    user: {
      id: "demo-user",
      email,
    },
  };
  profile = {
    id: "demo-user",
    name,
    phone: "",
    balance: 0,
    role: "user",
  };
  document.getElementById("navLoggedIn").classList.remove("hidden");
  document.getElementById("navAdminLink").classList.add("hidden");
  showView("dashboard");
}

async function tryDemoLogin(email, password) {
  const normalizedEmail = (email || "").trim().toLowerCase();
  const normalizedPassword = (password || "").trim();
  if (normalizedEmail === DEMO_LOGIN_EMAIL && normalizedPassword === DEMO_LOGIN_PASSWORD) {
    setDemoSession(email, "Utilisateur démo");
    return true;
  }
  return false;
}

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("loginError");
  errEl.textContent = "";
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  if (await tryDemoLogin(email, password)) {
    return;
  }

  const { error } = await sb.auth.signInWithPassword({
    email,
    password,
  });
  if (error) errEl.textContent = traduireErreur(error.message);
});

document.getElementById("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("registerError");
  errEl.textContent = "";
  const email = document.getElementById("regEmail").value;
  const password = document.getElementById("regPassword").value;

  if (await tryDemoLogin(email, password)) {
    return;
  }

  const { error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: document.getElementById("regName").value,
        phone: document.getElementById("regPhone").value,
      },
    },
  });
  if (error) errEl.textContent = traduireErreur(error.message);
});

function traduireErreur(msg) {
  if (/already registered/i.test(msg)) return "Un compte existe déjà avec cet email.";
  if (/invalid login credentials/i.test(msg)) return "Email ou mot de passe incorrect.";
  if (/password.*6/i.test(msg)) return "Le mot de passe doit contenir au moins 6 caractères.";
  return msg;
}

async function doLogout() {
  await sb.auth.signOut();
}

sb.auth.onAuthStateChange(async (event, s) => {
  session = s;
  if (session) {
    await loadProfile();
    renderInviteLink();
    document.getElementById("navLoggedIn").classList.remove("hidden");
    const role = profile?.role || "user";
    document.getElementById("navAdminLink").classList.toggle("hidden", role !== "admin");
    await loadCurrencySettings();
    showView("dashboard");
  } else {
    profile = null;
    document.getElementById("navLoggedIn").classList.add("hidden");
    showView("auth");
  }
});

async function loadProfile() {
  if (!session?.user?.id) {
    profile = null;
    return;
  }

  const { data, error } = await sb.from("profiles").select("*").eq("id", session.user.id).single();
  if (error) {
    profile = {
      id: session.user.id,
      name: session.user.email || "Utilisateur",
      phone: "",
      balance: 0,
      role: "user",
    };
    return;
  }

  profile = data || {
    id: session.user.id,
    name: session.user.email || "Utilisateur",
    phone: "",
    balance: 0,
    role: "user",
  };
}

async function loadCurrencySettings() {
  const { data } = await sb.from("settings").select("currency").eq("id", 1).single();
  if (data) currentCurrency = CURRENCY_MAP[data.currency] || CURRENCY_MAP.XOF;
}

// =============================================================================
// Dashboard
// =============================================================================
// Choisit 5 pubs parmi les actives, de façon stable pendant une heure donnée
// (tout le monde voit la même sélection pendant la même heure), puis ça
// change automatiquement à l'heure suivante.
function pickHourlyAds(ads) {
  if (ads.length <= 5) return ads;
  const hourIndex = Math.floor(Date.now() / 3600000);
  const start = hourIndex % ads.length;
  const selection = [];
  for (let i = 0; i < 5; i++) selection.push(ads[(start + i) % ads.length]);
  return selection;
}

function updateRotationCountdown() {
  const el = document.getElementById("nextRotation");
  if (!el) return;
  const msLeft = 3600000 - (Date.now() % 3600000);
  const min = Math.floor(msLeft / 60000);
  const sec = Math.floor((msLeft % 60000) / 1000);
  el.textContent = `${min}min ${sec.toString().padStart(2, "0")}s`;
}
setInterval(updateRotationCountdown, 1000);

async function loadDashboard() {
  await loadProfile();
  await loadCurrencySettings();
  renderInviteLink();
  updateRotationCountdown();
  document.getElementById("dashBalance").textContent = fmtMoney(profile.balance);

  const today = new Date().toISOString().slice(0, 10);
  const { data: ads, error: adsError } = await sb.from("ads").select("*").eq("active", true).order("id");
  const { data: doneRows } = await sb
    .from("watches")
    .select("ad_id")
    .eq("user_id", session.user.id)
    .eq("watch_date", today)
    .not("completed_at", "is", null);
  const doneIds = new Set((doneRows || []).map((r) => r.ad_id));

  const grid = document.getElementById("adsGrid");
  grid.innerHTML = "";

  const adsToRender = (ads && ads.length > 0) ? pickHourlyAds(ads) : [DEMO_AD];

  if (adsError && (!ads || ads.length === 0)) {
    grid.innerHTML = `
      <div class="ad-card" style="grid-column:1/-1;">
        <div class="thumb">⚠️</div>
        <div class="body">
          <strong>Mode démo activé</strong>
          <span style="color:var(--muted);font-size:0.85rem;">Une publicité de test a été chargée pour vous permettre de tester le flux complet.</span>
        </div>
      </div>`;
  }

  adsToRender.forEach((ad) => {
    const watchedToday = doneIds.has(ad.id);
    const el = document.createElement("div");
    el.className = "ad-card";
    el.innerHTML = `
      <div class="thumb">📺</div>
      <div class="body">
        <strong>${ad.title}</strong>
        <span style="color:var(--muted);font-size:0.85rem;">${ad.description || ""}</span>
        <span class="reward">+${fmtMoney(ad.reward_amount)} · ${ad.duration_seconds}s</span>
        ${watchedToday
          ? '<span class="done">✓ Déjà gagné aujourd\'hui</span>'
          : `<button onclick="openWatch(${ad.id})">Regarder</button>`}
      </div>`;
    grid.appendChild(el);
  });
}

// =============================================================================
// Visionnage
// =============================================================================
async function openWatch(adId) {
  showView("watch");
  document.getElementById("watchErr").textContent = "";
  document.getElementById("watchOk").textContent = "";
  document.getElementById("confirmBtn").disabled = true;
  document.getElementById("confirmBtn").textContent = "Regardez jusqu'au bout pour valider";
  clearInterval(watchTimer);
  watchElapsed = 0;

  let ad = null;
  if (adId === "demo") {
    ad = DEMO_AD;
  } else {
    const { data, error } = await sb.from("ads").select("*").eq("id", adId).single();
    if (error || !data) { document.getElementById("watchErr").textContent = "Publicité introuvable."; return; }
    ad = data;
  }

  currentAd = ad;

  document.getElementById("watchTitle").textContent = ad.title + " — +" + fmtMoney(ad.reward_amount);
  // Pas de lecteur video a nous : la pub vient uniquement d'Adsterra,
  // declenchee ici (Direct Link verifiable si configure, sinon Popunder).
  triggerAdAndVerify();

  const isDemo = ad.is_demo || ad.id === "demo";
  if (isDemo) {
    watchTimer = setInterval(() => tickWatch(ad.duration_seconds || 5), 1000);
    return;
  }

  const { data, error } = await sb.rpc("start_watch", { p_ad_id: adId });
  if (error) { document.getElementById("watchErr").textContent = traduireErreurRpc(error.message); return; }
  const row = Array.isArray(data) ? data[0] : data;
  watchId = row.watch_id;

  watchTimer = setInterval(() => tickWatch(row.duration_seconds), 1000);
}

function tickWatch(durationSeconds) {
  watchElapsed += 1;
  const remaining = Math.max(0, durationSeconds - watchElapsed);
  const circumference = 327;
  document.getElementById("ringFg").style.strokeDashoffset = circumference * (remaining / durationSeconds);
  document.getElementById("ringLabel").textContent = remaining > 0 ? remaining + "s" : "✓";

  if (remaining <= 0) {
    clearInterval(watchTimer);
    refreshConfirmButtonState();
  }
}

document.getElementById("confirmBtn").addEventListener("click", async () => {
  if (currentAd?.is_demo || currentAd?.id === "demo") {
    const reward = Number(currentAd.reward_amount || 500);
    const nextBalance = Number(profile?.balance || 0) + reward;
    if (profile) profile.balance = nextBalance;
    document.getElementById("watchOk").textContent = `+${fmtMoney(reward)} crédités ! Nouveau solde : ${fmtMoney(nextBalance)}.`;
    document.getElementById("confirmBtn").disabled = true;
    setTimeout(() => showView("dashboard"), 1500);
    return;
  }

  const { data, error } = await sb.rpc("complete_watch", { p_watch_id: watchId });
  if (error) { document.getElementById("watchErr").textContent = traduireErreurRpc(error.message); return; }
  const row = Array.isArray(data) ? data[0] : data;
  document.getElementById("watchOk").textContent = `+${fmtMoney(row.reward)} crédités ! Nouveau solde : ${fmtMoney(row.balance)}.`;
  document.getElementById("confirmBtn").disabled = true;
  setTimeout(() => showView("dashboard"), 1500);
});

function traduireErreurRpc(msg) {
  // Supabase prefixe parfois le message ; on nettoie un minimum
  return msg.replace(/^ERROR:\s*/i, "");
}

// =============================================================================
// Retraits
// =============================================================================
async function loadWithdraw() {
  await loadProfile();
  await loadCurrencySettings();
  document.getElementById("wdBalance").textContent = fmtMoney(profile.balance);
  document.getElementById("wdMinInfo").textContent =
    `Retrait minimum : ${fmtMoney(currentCurrency.min)}. Le paiement est traité manuellement sous 24-48h.`;

  const { count: watchedCount } = await sb
    .from("watches")
    .select("*", { count: "exact", head: true })
    .eq("user_id", session.user.id)
    .not("completed_at", "is", null);

  const referralCount = Number(profile?.referrals_count || profile?.referral_count || 0);
  renderWithdrawProgress({ watchedCount: watchedCount ?? 0, balance: Number(profile?.balance || 0), referralCount });

  const select = document.getElementById("wdMethod");
  select.innerHTML = "";
  currentCurrency.methods.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m; opt.textContent = METHOD_LABELS[m] || m;
    select.appendChild(opt);
  });
  updateDestinationLabel();

  const { data: withdrawals } = await sb
    .from("withdrawals").select("*").eq("user_id", session.user.id)
    .order("requested_at", { ascending: false });

  const body = document.getElementById("wdHistoryBody");
  body.innerHTML = "";
  (withdrawals || []).forEach((w) => {
    const tr = document.createElement("tr");
    const date = new Date(w.requested_at).toLocaleDateString("fr-FR");
    const statusLabel = { pending: "En attente", paid: "Payé", rejected: "Rejeté" }[w.status];
    tr.innerHTML = `<td>${date}</td><td>${fmtMoney(w.amount)}</td><td>${METHOD_LABELS[w.method] || w.method}</td><td><span class="badge ${w.status}">${statusLabel}</span></td>`;
    body.appendChild(tr);
  });
}

document.getElementById("wdMethod").addEventListener("change", updateDestinationLabel);
function updateDestinationLabel() {
  const method = document.getElementById("wdMethod").value;
  document.getElementById("wdDestLabel").textContent = DESTINATION_LABELS[method] || "Destination";
}

document.getElementById("withdrawForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("wdErr");
  const okEl = document.getElementById("wdOk");
  errEl.textContent = ""; okEl.textContent = "";
  const { error } = await sb.rpc("request_withdrawal", {
    p_amount: Number(document.getElementById("wdAmount").value),
    p_method: document.getElementById("wdMethod").value,
    p_destination: document.getElementById("wdDestination").value,
  });
  if (error) { errEl.textContent = traduireErreurRpc(error.message); return; }
  okEl.textContent = "Demande de retrait envoyée !";
  e.target.reset();
  loadWithdraw();
});

// =============================================================================
// Admin
// =============================================================================
const CURRENCY_LABELS = { XOF: "Franc CFA (XOF)", EUR: "Euro (EUR)", USD: "Dollar américain (USD)" };

async function loadAdmin() {
  if (!profile || profile.role !== "admin") { showView("dashboard"); return; }
  await loadCurrencySettings();

  const select = document.getElementById("currencySelect");
  select.innerHTML = "";
  Object.keys(CURRENCY_MAP).forEach((code) => {
    const opt = document.createElement("option");
    opt.value = code; opt.textContent = CURRENCY_LABELS[code];
    if (code === currentCurrency.code) opt.selected = true;
    select.appendChild(opt);
  });

  const { count: totalUsers } = await sb.from("profiles").select("*", { count: "exact", head: true }).eq("role", "user");
  const { data: paidRows } = await sb.from("withdrawals").select("amount").eq("status", "paid");
  const totalPaid = (paidRows || []).reduce((s, w) => s + Number(w.amount), 0);
  const { count: pendingCount } = await sb.from("withdrawals").select("*", { count: "exact", head: true }).eq("status", "pending");
  const { count: watchCount } = await sb.from("watches").select("*", { count: "exact", head: true }).not("completed_at", "is", null);

  document.getElementById("statUsers").textContent = totalUsers ?? 0;
  document.getElementById("statPaid").textContent = fmtMoney(totalPaid);
  document.getElementById("statPending").textContent = pendingCount ?? 0;
  document.getElementById("statWatches").textContent = watchCount ?? 0;

  await loadAdminWithdrawals();
  await loadAdminAds();
  await loadAdminUsers();
}

async function loadAdminWithdrawals() {
  const { data: withdrawals } = await sb.from("withdrawals").select("*").order("requested_at", { ascending: false });
  const userIds = [...new Set((withdrawals || []).map((w) => w.user_id))];
  const { data: profiles } = userIds.length
    ? await sb.from("profiles").select("id,name").in("id", userIds)
    : { data: [] };
  const nameById = Object.fromEntries((profiles || []).map((p) => [p.id, p.name]));

  const body = document.getElementById("adminWithdrawalsBody");
  body.innerHTML = "";
  (withdrawals || []).forEach((w) => {
    const tr = document.createElement("tr");
    const statusLabel = { pending: "En attente", paid: "Payé", rejected: "Rejeté" }[w.status];
    tr.innerHTML = `
      <td>${nameById[w.user_id] || "?"}</td><td>${fmtMoney(w.amount)}</td><td>${METHOD_LABELS[w.method] || w.method}</td>
      <td>${w.destination}</td><td><span class="badge ${w.status}">${statusLabel}</span></td>
      <td>${w.status === "pending" ? `
        <button onclick="adminApprove(${w.id})" style="padding:6px 10px;font-size:0.8rem;">Approuver</button>
        <button class="danger" onclick="adminReject(${w.id})" style="padding:6px 10px;font-size:0.8rem;">Rejeter</button>` : "—"}</td>`;
    body.appendChild(tr);
  });
}

async function loadAdminAds() {
  const { data: ads } = await sb.from("ads").select("*").order("id");
  const body = document.getElementById("adminAdsBody");
  body.innerHTML = "";
  (ads || []).forEach((ad) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${ad.title}</td><td>${fmtMoney(ad.reward_amount)}</td><td>${ad.duration_seconds}s</td>
      <td>${ad.active ? "Active" : "Désactivée"}</td>
      <td><button onclick="adminToggleAd(${ad.id}, ${!ad.active})" style="padding:6px 10px;font-size:0.8rem;">${ad.active ? "Désactiver" : "Activer"}</button></td>`;
    body.appendChild(tr);
  });
}

async function loadAdminUsers() {
  const { data: users } = await sb.from("profiles").select("*").eq("role", "user");
  const body = document.getElementById("adminUsersBody");
  body.innerHTML = "";
  (users || []).forEach((u) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${u.name}</td><td>${u.phone}</td><td>${fmtMoney(u.balance)}</td>`;
    body.appendChild(tr);
  });
}

async function adminApprove(id) {
  const { error } = await sb.rpc("admin_approve_withdrawal", { p_withdrawal_id: id });
  if (error) return alert(traduireErreurRpc(error.message));
  loadAdmin();
}
async function adminReject(id) {
  const { error } = await sb.rpc("admin_reject_withdrawal", { p_withdrawal_id: id, p_reason: "" });
  if (error) return alert(traduireErreurRpc(error.message));
  loadAdmin();
}
async function adminToggleAd(id, active) {
  await sb.from("ads").update({ active }).eq("id", id);
  loadAdminAds();
}

document.getElementById("saveCurrencyBtn").addEventListener("click", async () => {
  const code = document.getElementById("currencySelect").value;
  const { error } = await sb.rpc("admin_set_currency", { p_currency: code });
  if (error) return alert(traduireErreurRpc(error.message));
  document.getElementById("currencyOk").textContent = "Devise mise à jour !";
  loadAdmin();
});

document.getElementById("adForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("adErr");
  errEl.textContent = "";
  const { error } = await sb.from("ads").insert({
    title: document.getElementById("adTitle").value,
    description: document.getElementById("adDescription").value,
    video_url: document.getElementById("adVideoUrl").value,
    reward_amount: Number(document.getElementById("adReward").value),
    duration_seconds: Number(document.getElementById("adDuration").value),
  });
  if (error) { errEl.textContent = traduireErreurRpc(error.message); return; }
  e.target.reset();
  loadAdminAds();
});
