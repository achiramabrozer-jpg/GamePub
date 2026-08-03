// =============================================================================
// CONFIGURATION — a completer avec vos propres identifiants
// =============================================================================

// 1) Supabase : Dashboard Supabase > Project Settings > API
const SUPABASE_URL = "https://ojmfixyicgrcucdncja.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qbWZpc3h5aWNncmN1Y2RuY2phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2ODk5MDAsImV4cCI6MjEwMTI2NTkwMH0.Zwyn5_jmiTWTrcQ-yYidf5xHjSuumyGTMVq6OOjUj4s";

// 2) Adsterra : DEUX formats sont actifs en meme temps ici.
//    a) POPUNDER : se charge en arriere-plan (aucune verification possible
//       avec ce format, mais ca genere quand meme des revenus d'affichage).
//    b) SMART LINK : ouvert nous-memes via window.open(), ce qui permet de
//       verifier que l'utilisateur est bien revenu sur le site avant de
//       debloquer le bouton "Valider".
const ADSTERRA_POPUNDER_SRC = "https://pl30653477.effectivecpmnetwork.com/ff/cb/ee/ffcbee00d7ebb42dc4ab275d61e677cf.js";
const ADSTERRA_SMARTLINK_URL = "https://www.effectivecpmnetwork.com/b9s4q78k8?key=c72b0e4caa6d14011fdbb092f399580e";

// =============================================================================
// Devises et methodes de retrait
// =============================================================================
const CURRENCY_MAP = {
  XOF: { code: "XOF", label: "Franc CFA", locale: "fr-FR", min: 20000, methods: ["flooz", "tmoney", "orange", "wave", "mtn"] },
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

// =============================================================================
// Supabase client + etat
// =============================================================================
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let session = null;
let profile = null;
let dashboardInfo = null; // { reward_amount, duration_seconds, watches_per_hour, completed_this_hour, currency, balance }
let watchId = null;
let watchTimer = null;
let watchElapsed = 0;
let watchDuration = 0;
let watchReward = 0;
let adVerified = false;

// Capture le "?ref=<id>" de l'URL (lien d'invitation) des le chargement.
const REFERRAL_ID = new URLSearchParams(window.location.search).get("ref") || "";

// =============================================================================
// Navigation
// =============================================================================
function showView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById("view-" + name).classList.add("active");
  if (name === "dashboard") loadDashboard();
  if (name === "withdraw") loadWithdraw();
}

function switchAuthTab(tab) {
  document.getElementById("tabLogin").classList.toggle("active", tab === "login");
  document.getElementById("tabRegister").classList.toggle("active", tab === "register");
  document.getElementById("loginForm").style.display = tab === "login" ? "block" : "none";
  document.getElementById("registerForm").style.display = tab === "register" ? "block" : "none";
}

// =============================================================================
// Authentification
// =============================================================================
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("loginError");
  errEl.textContent = "";
  const { error } = await sb.auth.signInWithPassword({
    email: document.getElementById("loginEmail").value,
    password: document.getElementById("loginPassword").value,
  });
  if (error) errEl.textContent = traduireErreur(error.message);
});

document.getElementById("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("registerError");
  errEl.textContent = "";
  const { error } = await sb.auth.signUp({
    email: document.getElementById("regEmail").value,
    password: document.getElementById("regPassword").value,
    options: {
      data: {
        name: document.getElementById("regName").value,
        phone: document.getElementById("regPhone").value,
        ref: REFERRAL_ID,
      },
    },
  });
  if (error) { errEl.textContent = traduireErreur(error.message); return; }
  errEl.textContent = "";
  document.getElementById("registerError").className = "success";
  document.getElementById("registerError").textContent =
    "Compte créé ! Si Supabase demande une confirmation par email, vérifiez votre boîte mail avant de vous connecter.";
});

function traduireErreur(msg) {
  if (/already registered/i.test(msg)) return "Un compte existe déjà avec cet email.";
  if (/invalid login credentials/i.test(msg)) return "Email ou mot de passe incorrect.";
  const pwMatch = msg.match(/password.*?(\d+)\s*character/i);
  if (pwMatch) return `Le mot de passe doit contenir au moins ${pwMatch[1]} caractères.`;
  if (/signups.*disabled/i.test(msg)) return "Les inscriptions sont désactivées côté Supabase (Authentication > Providers > Email).";
  return msg;
}

async function doLogout() {
  await sb.auth.signOut();
}

sb.auth.onAuthStateChange(async (event, s) => {
  session = s;
  if (session) {
    await loadProfile();
    document.getElementById("navLoggedIn").classList.remove("hidden");
    showView("dashboard");
  } else {
    profile = null;
    document.getElementById("navLoggedIn").classList.add("hidden");
    showView("auth");
  }
});

async function loadProfile() {
  const { data, error } = await sb.from("profiles").select("*").eq("id", session.user.id).single();
  if (!error) profile = data;
}

// =============================================================================
// Dashboard — quota horaire generique (plus de "pubs" individuelles)
// =============================================================================
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
  updateRotationCountdown();
  const { data, error } = await sb.rpc("get_dashboard_info").single();
  if (error) {
    document.getElementById("quotaText").textContent = "Erreur de chargement : " + error.message;
    return;
  }
  dashboardInfo = data;
  currentCurrency = CURRENCY_MAP[data.currency] || CURRENCY_MAP.XOF;

  document.getElementById("dashBalance").textContent = fmtMoney(data.balance);
  const remaining = data.watches_per_hour - data.completed_this_hour;
  document.getElementById("quotaText").textContent =
    `${remaining} publicité${remaining > 1 ? "s" : ""} disponible${remaining > 1 ? "s" : ""} sur ${data.watches_per_hour} cette heure-ci — +${fmtMoney(data.reward_amount)} chacune.`;

  const grid = document.getElementById("adsGrid");
  grid.innerHTML = "";
  for (let i = 0; i < data.watches_per_hour; i++) {
    const done = i < data.completed_this_hour;
    const el = document.createElement("div");
    el.className = "ad-card";
    el.innerHTML = `
      <div class="thumb">📺</div>
      <div class="body">
        <strong>Publicité #${i + 1}</strong>
        <span class="reward">+${fmtMoney(data.reward_amount)} · ${data.duration_seconds}s</span>
        ${done
          ? '<span class="done">✓ Déjà gagné cette heure</span>'
          : `<button onclick="openWatch()">Regarder</button>`}
      </div>`;
    grid.appendChild(el);
  }
}

// =============================================================================
// Visionnage
// =============================================================================
async function openWatch() {
  showView("watch");
  document.getElementById("watchErr").textContent = "";
  document.getElementById("watchOk").textContent = "";
  document.getElementById("confirmBtn").disabled = true;
  document.getElementById("confirmBtn").textContent = "Regardez jusqu'au bout pour valider";
  clearInterval(watchTimer);
  watchElapsed = 0;
  adVerified = false;

  const { data, error } = await sb.rpc("start_watch").single();
  if (error) { document.getElementById("watchErr").textContent = traduireErreurRpc(error.message); return; }

  watchId = data.watch_id;
  watchDuration = data.duration_seconds;
  watchReward = dashboardInfo ? dashboardInfo.reward_amount : 0;

  document.getElementById("watchTitle").textContent = "Publicité en cours — +" + fmtMoney(watchReward);
  triggerAdAndVerify();

  watchTimer = setInterval(() => tickWatch(watchDuration), 1000);
}

function injectPopunder() {
  const old = document.getElementById("adsterra-popunder-script");
  if (old) old.remove();
  const script = document.createElement("script");
  script.id = "adsterra-popunder-script";
  script.src = ADSTERRA_POPUNDER_SRC;
  document.body.appendChild(script);
}

function triggerAdAndVerify() {
  const slot = document.getElementById("adsterraSlot");

  // Popunder : se declenche en arriere-plan, sans bloquer la suite.
  injectPopunder();

  // Smart Link : ouvert par nous, donc verifiable.
  const win = window.open(ADSTERRA_SMARTLINK_URL, "_blank");
  if (!win) {
    slot.textContent = "⚠️ Pop-up bloquée par votre navigateur. Autorisez les pop-ups pour ce site puis réessayez.";
    return;
  }
  slot.textContent = "Publicité ouverte dans un nouvel onglet — regardez-la puis revenez ici.";
  window.addEventListener("focus", onReturnFromAd, { once: true });
}

function onReturnFromAd() {
  adVerified = true;
  document.getElementById("adsterraSlot").textContent = "✅ Retour détecté après consultation de la publicité.";
  refreshConfirmButtonState();
}

function refreshConfirmButtonState() {
  const btn = document.getElementById("confirmBtn");
  if (!btn) return;
  const timerDone = watchElapsed >= watchDuration;
  if (timerDone && adVerified) {
    btn.disabled = false;
    btn.textContent = "Valider et encaisser";
  } else if (timerDone && !adVerified) {
    btn.disabled = true;
    btn.textContent = "Revenez sur cet onglet après avoir vu la pub";
  }
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
  const { data, error } = await sb.rpc("complete_watch", { p_watch_id: watchId }).single();
  if (error) { document.getElementById("watchErr").textContent = traduireErreurRpc(error.message); return; }
  document.getElementById("watchOk").textContent = `+${fmtMoney(data.reward)} crédités ! Nouveau solde : ${fmtMoney(data.balance)}.`;
  document.getElementById("confirmBtn").disabled = true;
  setTimeout(() => showView("dashboard"), 1500);
});

function traduireErreurRpc(msg) {
  return msg.replace(/^ERROR:\s*/i, "");
}

// =============================================================================
// Retraits
// =============================================================================
async function loadWithdraw() {
  await loadProfile();
  const { data: info } = await sb.rpc("get_dashboard_info").single();
  if (info) currentCurrency = CURRENCY_MAP[info.currency] || CURRENCY_MAP.XOF;

  document.getElementById("wdBalance").textContent = fmtMoney(profile.balance);
  const minWithdrawal = info ? info.min_withdrawal : currentCurrency.min;
  const delayDays = info ? info.payout_delay_days : 7;
  document.getElementById("wdMinInfo").textContent =
    `Retrait minimum : ${fmtMoney(minWithdrawal)}. Le paiement est traité sous ${delayDays} jours.`;
  document.getElementById("wdAmount").min = minWithdrawal;

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
