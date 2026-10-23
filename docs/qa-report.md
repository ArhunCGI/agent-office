# Rapport QA — Agent Office (prototype)

Date : 23/10/2026 · Machine : MacBook (Apple Silicon), Node 24.21, Chromium Playwright headless.

## Critères d'acceptation

| # | Critère | Vérification | Résultat |
|---|---|---|---|
| 1 | `pnpm install && pnpm dev` ouvre la scène animée sans étape manuelle | dev server + démo intégrée ; `GET /` et `/gallery` répondent 200, la démo peuple le bureau | ✅ |
| 2 | `/gallery` montre personnages, animations, meubles | test « gallery renders » × 4 résolutions (> 150 canvases, 0 erreur) + capture `screenshots/qa/gallery-1920x1080.png` | ✅ |
| 3 | Scène agréable et cohérente, pixels nets, profondeur correcte | tests de netteté (blocs scale×scale uniformes), palette stricte, tri de profondeur ; **jugement visuel : à toi** | ✅ (technique) |
| 4 | Le scénario fait aller agents et sous-agents aux bons postes avec les bonnes animations | tests unitaires de la machine à états (poste + animation + orientation) + captures | ✅ |
| 5 | 2ᵉ personnage sans modifier le moteur | `robot.ts` + 1 ligne dans `characters/index.ts` + 1 ligne dans `kinds.json` ; testé (rendu de toutes les animations, `kind: "robot"`) | ✅ |
| 6 | 30 fps stables, faible CPU, pause onglet caché | mesure 5 min ci-dessous + test de pause | ✅ |
| 7 | Tests unitaires et visuels verts, rapport QA | 66 Vitest + 20 Playwright verts | ✅ |
| 8 | README complet | lancement, ajout perso / poste / pièce, format des événements, hooks Claude Code, WebViewScreenSaver | ✅ |

## Tests unitaires (Vitest) — `pnpm test` → 66/66 ✅

| Domaine | Fichier | Couverture |
|---|---|---|
| Projection iso | `iso.test.ts` | aller-retour grille ↔ écran, tuile 2:1 de 32×16 |
| Tri de profondeur | `iso.test.ts` | devant/derrière un bureau large, cloison fine entre deux agents, indépendance à l'ordre d'entrée (pas de scintillement), **cloisons derrière les meubles adossés** (régression) |
| A* | `pathfinding.test.ts` | plus court chemin, inatteignable, contournement, lignes droites, **jamais à travers une cloison**, tous les postes atteignables depuis le spawn |
| Machine à états | `office.test.ts` | spawn → idle, outil → poste + animation, bureau attitré par session, attente « ! », double `done`, despawn, agent inconnu, type inconnu, événements reçus pendant le spawn, sous-agents (mini, briefing, lien, retour + rapport, disparition avec le parent), 30 sous-agents sans emplacements en double, idle → cafétéria + discussions, aucune traversée de cloison sur 2 min, snapshot |
| Événements (zod) | `events.test.ts` | 5 types acceptés, payloads invalides rejetés, snapshot, scénarios générés valides et ordonnés |
| Mapping outil → poste | `events.test.ts` | 12 outils dont préfixe `mcp__` et outil inconnu ; animation par poste |
| Adaptateur hooks | `events.test.ts` | session complète avec sous-agent (`agent_id`), Notification, Stop, SessionEnd, passage direct d'un AgentEvent |
| Sprites / palette | `sprites.test.ts` | chaque perso × 9 animations × 4 directions × 2 tailles non vide, miroir SW = SE, fallback des types, **chaque meuble n'utilise que les 24 couleurs** |
| Viewport | `sprites.test.ts` | scale entier ≥ 2 et couverture de la fenêtre aux 4 résolutions |

## Tests navigateur (Playwright) — `pnpm test:visual` → 20/20 ✅

Captures dans `docs/screenshots/qa/`.

| Test | 1280×720 | 1920×1080 | 2560×1440 | 3024×1964 (Retina 2×) |
|---|---|---|---|---|
| Bureau vide : scale entier, `image-rendering: pixelated`, **0 bloc flou sur 4 000 échantillons**, **0 couleur hors palette** | ✅ | ✅ | ✅ | ✅ |
| Scène scriptée (≥ 4 agents dont sous-agents) nette, 0 erreur | ✅ | ✅ | ✅ | ✅ |
| Galerie | ✅ | ✅ | ✅ | ✅ |

| Robustesse | Résultat |
|---|---|
| 1 / 10 / 30 sous-agents occupés : 28–31 fps, 0 erreur | ✅ (30 fps mesurés dans les trois cas) |
| Scintillement de tri : 2 captures d'une scène figée (`?freeze=12`) avec 30 agents sont **identiques au pixel près** | ✅ |
| Agent inconnu, type inconnu, double `done`, parent absent | ✅ aucun crash, état cohérent |
| Onglet caché : 0 frame rendue pendant 1,5 s, reprise ensuite | ✅ |
| Déconnexion WebSocket (serveur tué) → l'écran garde l'état ; redémarrage → reconnexion auto + snapshot (l'agent disparu côté serveur est retiré) | ✅ |
| `POST /hook` (payload Claude Code) → agent à l'écran ; `POST /events` invalide → 400 ; payload de hook non reconnu → accepté avec 0 événement (jamais de 5xx) | ✅ |

## Performance — `pnpm perf` (5 min, 1920×1080, `?mock=1`)

| Mesure | Scénario 5 min (`?mock=1`, 1–4 agents) | Stress 1 min (`?mock=stress&n=30`, 31 agents) |
|---|---|---|
| FPS (moy / min / max) | 30 / 30 / 30 | 30 / 30 / 30 |
| Durée de frame (moy / max) | 0,19 ms / 0,36 ms | 0,35 ms / 0,45 ms |
| CPU thread principal (moy / max) | **2,3 %** / 3,6 % | **3,3 %** / 3,9 % |
| CPU onglet caché (30 s) | **0,03 %** | 0,17 % |
| Tas JS (début → fin, max) | 8,6 → 5,8 Mo, max 9,9 Mo (pas de fuite) | 10 → 9,2 Mo, max 13,2 Mo |

Données brutes : `docs/qa/perf.json`, `docs/qa/perf-stress30.json`, journal `docs/qa/perf.log`. (Pendant la phase cachée, la colonne « fps » du journal affiche la dernière valeur connue : la boucle ne tourne plus, comme le confirme le CPU à ~0 %.)

Méthode : `Performance.getMetrics` via CDP (`TaskDuration` = temps du thread principal), échantillonné toutes les 10 s ; FPS et durée de frame mesurés dans la boucle. Limites : Chromium headless (pas de compositing GPU réel) ; dans WebViewScreenSaver (WebKit), le coût de composition s'ajoute mais reste faible (un seul canvas, une `drawImage` par sprite, couche statique pré-rendue).

Pourquoi c'est léger : sprites et meubles pré-rendus une fois en cache, décor statique dans une seule image, 30 fps maximum, aucun `requestAnimationFrame` tant que la page est cachée, aucune allocation par frame hors tableaux de tri.

## Bugs trouvés et corrigés

| Bug | Cause | Correctif | Garde-fou |
|---|---|---|---|
| Une cloison passait **devant** le serveur, le tableau blanc et les machines à café (signalé en revue) | la boîte de profondeur de la cloison chevauchait la ligne de grille sur laquelle commencent ces meubles → égalité arbitrée par l'ordre d'insertion | boîte de la cloison entièrement côté arrière | test de régression (échouait avant correctif) |
| Erreur console « WebSocket closed without opened » en dev | le client HMR de Vite cherchait un port séparé en mode middleware | HMR rattaché au serveur HTTP de l'app | tests Playwright « 0 erreur » |
| Images figées (`?freeze`) différentes d'une capture à l'autre | les événements du simulateur continuaient de modifier la scène | le gel coupe aussi les événements entrants | test de stabilité |
| Boucle à 60 fps au lieu de 30 sur écran 60 Hz (dev, jalon 3) | reliquat de l'accumulateur de temps | soustraction de l'intervalle, plafonnée | tests 28–31 fps |
| Agent qui travaillait « entre deux cases » (dev, jalon 3) | outil reçu en plein pas, chemin vide | recentrage sur la case avant de travailler | tests de poste exact |

## Points d'attention (non bloquants)

- En 1920×1080 et 2560×1440, le monde est zoomé d'un cran pour des personnages lisibles : la caméra coupe légèrement les bords et se déplace doucement vers l'activité.
- Sans `agent_id` dans les payloads de hooks, les outils d'un sous-agent s'affichent sur l'agent de la session.
- La mesure CPU est faite en headless ; une mesure dans WebViewScreenSaver sur la machine cible reste à faire lors du packaging.
