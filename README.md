# GainPub — version 3 fichiers (HTML + CSS + JS), Supabase + Adsterra

Aucun serveur à faire tourner : c'est un site 100% statique (`index.html`,
`style.css`, `app.js`) qui parle directement à Supabase (base de données +
authentification) depuis le navigateur. Vous pouvez l'héberger n'importe où
qui sert des fichiers statiques : Netlify, Vercel, GitHub Pages, Cloudflare
Pages, ou même un simple hébergement mutuel.

## Étape 1 — Créer le projet Supabase

1. Allez sur [supabase.com](https://supabase.com), créez un compte et un
   nouveau projet (gratuit).
2. Dans **SQL Editor**, collez tout le contenu de `supabase-schema.sql` et
   cliquez "Run". Ça crée les tables, la sécurité (RLS) et toute la logique
   de gains/retraits sécurisée côté serveur Postgres.
3. Dans **Project Settings > API**, copiez :
   - `Project URL`
   - la clé `anon public`
4. Ouvrez `app.js` et remplacez tout en haut :
   ```js
   const SUPABASE_URL = "https://VOTRE-PROJET.supabase.co";
   const SUPABASE_ANON_KEY = "VOTRE_CLE_ANON_PUBLIC";
   ```

## Étape 2 — Créer votre compte admin

1. Ouvrez `index.html` dans un navigateur (ou déployez-le, voir Étape 4) et
   inscrivez-vous normalement avec votre propre email.
2. Retournez dans Supabase, **SQL Editor**, et lancez (avec votre email) :
   ```sql
   update profiles set role = 'admin'
   where id = (select id from auth.users where email = 'votre@email.com');
   ```
3. Reconnectez-vous sur le site : l'onglet "Admin" apparaît dans le menu.

## Étape 3 — Adsterra (monétisation réelle)

1. Créez un compte sur [adsterra.com](https://adsterra.com), ajoutez votre
   site (une fois qu'il a une URL publique — voir Étape 4) et attendez
   l'approbation.
2. Une fois approuvé, créez un "Ad Unit" (Social Bar, Banner ou Native
   fonctionnent bien pour ce type de site) : Adsterra vous donne un extrait
   `<script>...</script>`.
3. Collez ce code dans `app.js`, fonction `injectAdsterra()` (les
   instructions sont dans les commentaires du fichier).

**Important à savoir** : Adsterra (comme la plupart des réseaux publicitaires)
n'a pas de format "regardez X secondes = événement de fin" comme YouTube. Sur
ce site, la pub Adsterra s'affiche simplement à côté du minuteur pendant que
l'utilisateur patiente ; c'est notre propre minuteur (vérifié côté serveur
Supabase) qui débloque la récompense, pas un signal venant d'Adsterra. Vérifiez
aussi les conditions d'utilisation d'Adsterra concernant le "trafic incité"
(payer les utilisateurs pour voir des pubs) avant de lancer publiquement —
certains réseaux publicitaires restreignent ou interdisent ce modèle.

## Étape 4 — Héberger le site

Le plus simple : [Netlify Drop](https://app.netlify.com/drop) — glissez le
dossier contenant `index.html`, `style.css`, `app.js` dans la page, et vous
obtenez une URL publique en quelques secondes. Vous pouvez aussi utiliser
GitHub Pages ou Vercel de la même façon (déployer un dossier statique).

## Comment ça marche (architecture)

- **Authentification** : gérée entièrement par Supabase Auth (email + mot de
  passe). Pas de mot de passe stocké dans votre code.
- **Anti-fraude** : le temps de visionnage minimum est vérifié **dans une
  fonction Postgres** (`complete_watch`), pas dans le navigateur — un
  utilisateur ne peut pas modifier le JavaScript pour tricher.
- **Sécurité des soldes** : les utilisateurs ne peuvent jamais modifier leur
  propre solde directement (Row Level Security). Seules les fonctions
  sécurisées (`complete_watch`, `request_withdrawal`, `admin_approve_withdrawal`...)
  peuvent le faire, et chacune vérifie les règles métier avant d'agir.
- **Devises et méthodes de retrait** : Franc CFA (Flooz, T-Money, Orange
  Money, Wave, MTN Mobile Money), Euro et Dollar (PayPal, virement). Réglable
  dans le panneau admin.
- **Paiement réel** : comme pour la version précédente, aucun opérateur
  Mobile Money / PayPal n'est branché automatiquement (ça demande un compte
  marchand). Chaque retrait reste "en attente" jusqu'à ce que vous l'ayez payé
  manuellement puis approuvé dans l'admin.

## Fichiers

```
index.html            toutes les pages du site (connexion, tableau de bord,
                       visionnage, retraits, admin) en une seule page
style.css              habillage visuel
app.js                 toute la logique (Supabase, minuteur, Adsterra...)
supabase-schema.sql    a coller UNE FOIS dans Supabase (pas un fichier du site)
```
