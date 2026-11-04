# SCABB Analyse — mise en route (v2 · Élite 2)

Application pour téléphone, iPad, tablette et ordinateur, réservée au staff du SCABB.

| Onglet | Contenu |
|---|---|
| **Matchs** | Calendrier du SCABB, créé automatiquement depuis la LNB : prochain match, résultats, matchs à venir |
| **Page d'un match** | **Live** : stats avancées, cinq sur le terrain, +/- de chaque cinq, joueurs. **Rotations** : frise des cinq successifs, verte ou rouge. **Rapports** : mi-temps (QT1, QT2, bilan, cinq efficaces et moins efficaces, ajustements) et fin de match (QT3, QT4, bilan, axes, contenus d'entraînement), en PDF. **Bilan** : ce match comparé à nos moyennes |
| **Adversaire** | Analyse avancée du prochain adversaire, qui passe automatiquement au suivant après chaque match. Elle contient : rangs sur 20 équipes, forces et faiblesses, duels avec le SCABB, joueurs, cinq, résultats. **Rapport de scouting** rédigé par Claude, en PDF |
| **Championnat** | Classement avancé des 20 équipes d'Élite 2, triable (Net, ORtg, DRtg, rythme, Four Factors…), et nuage attaque/défense. Chaque équipe a sa fiche complète |
| **Évolution** | Le SCABB match après match : courbes, points positifs et négatifs, quart-temps, bilan des joueurs, cinq de la saison. **Bilan et axes de travail du staff** rédigés par Claude, avec un plan de séances, en PDF |

Le championnat Betclic Élite et l'option photo ont été retirés. Toutes les données viennent des feuilles officielles publiées par la LNB.

## Comment les données arrivent

| Élément | Rôle | Coût |
|---|---|---|
| **Robot championnat** (GitHub Actions, chaque nuit vers 23h45 et 6h30) | Lit le calendrier Élite 2 (J1 à J38) et le Boxscore + Play by play de chaque match terminé. Met à jour le calendrier du SCABB, le classement et les fiches des 20 équipes | gratuit |
| **Robot live** (GitHub Actions, démarré par un bouton) | Suit un match du SCABB toutes les 40 secondes. Crée les rapports mi-temps et final, puis relance le robot championnat | gratuit |
| **Supabase** | Base de données, connexion du staff, fonctions `robot` et `report` | gratuit |
| **Netlify** | Héberge l'application (lien web installable) | gratuit |
| **Claude (API Anthropic)** | Rédige les textes : rapports de match, scouting, bilan de saison | quelques centimes par rapport |

> **Mode démo** : avec `web/config.js` vide, l'application tourne avec un championnat fictif. Seul le SCABB garde son nom, les 19 autres équipes sont inventées. Pratique pour la découvrir avant de tout installer.

---

## Étape 1 — GitHub

1. Crée un compte sur https://github.com, puis un dépôt **`scabb-analyse`**. Un dépôt public donne des minutes de robot illimitées ; les clés restent dans les « secrets ».
2. *Add file → Upload files* : glisse **tout le contenu** de ce dossier, y compris le dossier `.github`.

## Étape 2 — Supabase

1. Crée un compte sur https://supabase.com, puis **New project** (région *West EU (Paris)*).
2. Va dans **SQL Editor → New query**, colle `supabase/schema.sql`, puis clique sur **Run**.
3. Va dans **Authentication → Users → Add user** et crée ton compte, plus ceux du staff.
4. Va dans **Authentication → Sign In / Providers** et désactive **Allow new users to sign up**.
5. Va dans **Project Settings → API** et note **Project URL**, la clé **anon / publishable** (publique) et la clé **service_role / secret** (secrète).

## Étape 3 — Fonctions Supabase (sans terminal)

1. Dans Supabase, clique sur ton avatar → **Account preferences → Access Tokens → Generate new token** (nom : `github`) et copie le jeton.
2. Dans GitHub, va dans **Settings → Secrets and variables → Actions** et ajoute `SUPABASE_ACCESS_TOKEN` (ce jeton) et `SUPABASE_PROJECT_REF` (la partie `abcd` de `https://abcd.supabase.co`).
3. Va dans **Actions → Déployer les fonctions Supabase → Run workflow**. Le déploiement prend environ 1 minute.

Ensuite, dans Supabase, va dans **Edge Functions → Secrets** et ajoute :

| Nom | Valeur |
|---|---|
| `ANTHROPIC_API_KEY` | clé API Claude (https://console.anthropic.com → *API keys*, avec un peu de crédit) |
| `GH_REPO` | `ton-pseudo/scabb-analyse` |
| `GH_TOKEN` | jeton GitHub : *Settings → Developer settings → Fine-grained tokens*, dépôt `scabb-analyse`, permission **Actions : Read and write** |
| `ROBOT_KEY` | un mot de passe long inventé (30 caractères au hasard) |
| `ANTHROPIC_MODEL` | *(facultatif)* `claude-sonnet-5-5` par défaut |

## Étape 4 — Secrets des robots (GitHub)

Dans le dépôt, va dans **Settings → Secrets and variables → Actions → New repository secret** et ajoute :
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `ROBOT_KEY` (le même que dans Supabase).

## Étape 5 — Premier chargement du championnat

Dans le dépôt, va dans **Actions → Championnat Élite 2 → Run workflow**, mets `full` à **1**, puis lance. Compte 20 à 40 minutes la première fois. Ensuite, le robot tourne tout seul chaque nuit, en environ 5 minutes. Le bouton **Mettre à jour** de l'application le relance à la demande.

## Étape 6 — Netlify

1. Dans le dépôt, modifie `web/config.js` : renseigne `SUPABASE_URL` et `SUPABASE_ANON_KEY`, puis *Commit*.
2. Sur https://netlify.com, va dans **Add new site → Import an existing project → GitHub**, choisis `scabb-analyse`, puis **Deploy**. Les réglages sont lus dans `netlify.toml`.
3. Installe l'application :
   - iPhone / iPad : Safari → Partager → **Sur l'écran d'accueil** ;
   - Android : Chrome → ⋮ → **Ajouter à l'écran d'accueil** ;
   - ordinateur : icône d'installation dans la barre d'adresse de Chrome ou Edge.

## Un jour de match

1. **Matchs** : la carte « Prochain match » est déjà là.
2. **Adversaire**, dans la semaine : lis la fiche, puis **Rapport de scouting** pour avoir le PDF.
3. Environ 10 minutes avant l'entre-deux : ouvre le match, puis **Démarrer le suivi live**.
4. À la mi-temps, le rapport arrive tout seul (**Rapports → Télécharger le PDF**).
5. Au buzzer : le compte rendu final arrive tout seul. Le championnat se met à jour : classement, fiches, Évolution. L'onglet Adversaire passe au match suivant.
6. Dans la semaine : **Évolution → Bilan et axes de travail** pour le staff.

## Limites à connaître

- Les robots lisent les **pages publiques** de la LNB comme un visiteur. Ils n'utilisent pas d'accès officiel : si la LNB modifie son site, il faudra les adapter. Pour un usage durable, un accès officiel aux données (demande du club à la LNB) reste la meilleure solution.
- Le classement est calculé : victoires, puis écart de points. Les critères officiels de départage de la LNB (confrontations directes) ne sont pas appliqués.
- Les minutes affichées par joueur sont recalculées depuis le Play by play, car celles du Boxscore LNB sont incomplètes.
- Le robot live met environ 1 minute à démarrer.

## Structure

```
web/                       application (Netlify)
  app.js                   écrans : Matchs, match (Live, Rotations, Rapports, Bilan), Adversaire, Championnat, Évolution, Réglages
  report-view.js           PDF : mi-temps, fin de match, scouting, évolution
  demo.js                  championnat fictif (mode démo)
shared/                    calculs communs (copiés partout par tools/sync.sh)
  lnb.js                   lecture calendrier, Boxscore, Play by play ; cinq, +/-, rotations, Four Factors
  report-lib.js            statistiques et consignes Claude des rapports de match
  league-lib.js            profils des 20 équipes, rangs, classement, adversaire, évolution, consignes Claude
worker/                    robots (GitHub Actions)
  browser.mjs              navigation sur le site LNB
  league.mjs               robot championnat
  live.mjs                 robot live
.github/workflows/         league.yml (chaque nuit + à la demande), live.yml
supabase/                  schema.sql, functions/robot, functions/report
tests/                     tests sur des extraits réels de pages LNB
```

Réalisé par Maxence Collignon.
