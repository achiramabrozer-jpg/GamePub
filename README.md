# GainPub — version simplifiée (sans panel admin, sans gestion de pubs)

Cette version part du principe que **c'est Adsterra qui fournit le contenu
publicitaire** — le site ne gère plus de liste de "pubs" à créer à la main.
Chaque heure, l'utilisateur peut regarder un nombre fixe de publicités
(5 par défaut) : chaque clic sur "Regarder" ouvre le Smart Link Adsterra dans
un nouvel onglet, un minuteur compte le temps, et une récompense fixe est
créditée une fois le temps écoulé ET le retour sur le site détecté.

**Il n'y a plus de panel admin sur le site.** Vous gérez tout directement
dans l'interface Supabase (Table Editor) :

| Ce que vous voulez faire | Où le faire |
|---|---|
| Changer la devise, le montant de la récompense, la durée du minuteur, le nombre de pubs/heure | Table Editor → table `settings` (une seule ligne, id=1) |
| Traiter un retrait | Table Editor → table `withdrawals` : envoyez l'argent réel, puis passez `status` à `paid` (ou `rejected` + remettre le montant dans `profiles.balance` du concerné) |
| Voir vos utilisateurs et leurs soldes | Table Editor → table `profiles` |

## Installation

1. **Supabase** : créez un projet sur supabase.com, collez tout le contenu de
   `supabase-schema.sql` dans SQL Editor, cliquez "Run".
2. Dans **Project Settings > API**, copiez `Project URL` et la clé
   `anon public`, collez-les en haut de `app.js` :
   ```js
   const SUPABASE_URL = "https://VOTRE-PROJET.supabase.co";
   const SUPABASE_ANON_KEY = "VOTRE_CLE_ANON_PUBLIC";
   ```
3. **Authentication > Providers > Email** : assurez-vous que "Enable Email
   provider" et "Allow new users to sign up" sont activés (sinon l'inscription
   échoue avec l'erreur "Email signups are disabled").
4. Le Smart Link Adsterra est déjà branché dans `app.js`
   (`ADSTERRA_SMARTLINK_URL`) — remplacez-le par le vôtre si besoin.
5. Hébergez les 3 fichiers (`index.html`, `style.css`, `app.js`) sur Netlify
   Drop, Vercel, ou GitHub Pages.

## Comment ça marche

- **Quota horaire** : chaque utilisateur peut regarder jusqu'à
  `watches_per_hour` publicités par heure (5 par défaut). Le quota se
  réinitialise au début de chaque heure. C'est vérifié côté serveur
  (fonction `start_watch`), impossible à contourner depuis le navigateur.
- **Anti-fraude** : le temps minimum de visionnage est vérifié dans une
  fonction Postgres (`complete_watch`), pas dans le JavaScript.
- **Vérification "pub vue"** : en plus du minuteur, le site vérifie que
  l'utilisateur est bien revenu sur l'onglet après avoir ouvert le Smart Link
  Adsterra (détection du retour de focus) avant de débloquer le bouton
  "Valider".
- **Parrainage** : le lien d'invitation (`?ref=...`) enregistre vraiment qui a
  invité qui (colonne `referred_by` dans `profiles`).

## Fichiers

```
index.html            connexion, tableau de bord, visionnage, retraits
style.css             habillage visuel
app.js                toute la logique (Supabase, minuteur, Adsterra)
supabase-schema.sql   a coller UNE FOIS dans Supabase (pas un fichier du site)
```
