# Agent Office

Écran de veille macOS en pixel art isométrique : un petit bureau de nuit où chaque session Claude Code (et chaque sous-agent) est un personnage qui se déplace vers le poste correspondant à l'outil qu'il utilise.

![Vue d'ensemble](docs/screenshots/m3b-world-overview.png)

- **Monde en L** : open space (18 bureaux), labo (bibliothèque, serveurs, tableau blanc, fenêtre), cafétéria (café, tables, canapé), séparés par des cloisons basses avec portes.
- **Mascotte « Clawd »** (corail) ; sous-agents en version mini, teinte + accessoire par instance ; 2ᵉ personnage de démo « Bolt » (robot bleu).
- **Lisible d'un coup d'œil** : au poste et animé = travaille ; bulle « ! » = attend une permission ; à la cafétéria avec « zzz » = inactif ; bulles à faux texte = discussion (briefing, rapport, pause café).
- **Rendu** : sprites 100 % procéduraux (aucune image), palette de 24 couleurs, scale entier (pixels nets), 30 fps max, zéro rendu quand l'écran est caché.

## Lancer

```bash
pnpm install
```

```bash
pnpm dev
```

Puis ouvrir http://localhost:4317 (scène) et http://localhost:4317/gallery (galerie de tous les sprites, animations, meubles, bulles).
En dev, une **démo** tourne toute seule et s'arrête dès qu'un vrai événement arrive (`DEMO=0 pnpm dev` pour la couper).

| Commande | Effet |
|---|---|
| `pnpm dev` | serveur (Vite en middleware) + WebSocket `/events` + `POST /hook` sur le port 4317 (`PORT=…`) |
| `pnpm sim` | joue le scénario scripté vers le serveur (`--random`, `--stress 30`, `--speed 2`) |
| `pnpm build && pnpm start` | version de production (sert `dist/`) |
| `pnpm test` | tests unitaires (Vitest) |
| `pnpm test:visual` | tests navigateur (Playwright ; `npx playwright install chromium` la première fois) |
| `pnpm perf` | mesure FPS/CPU sur 5 min → `docs/qa/perf.json` |

Sans serveur : `/?mock=1` (scénario scripté puis aléatoire), `/?mock=random`, `/?mock=stress&n=30`, avec `&speed=3` pour accélérer.

## Architecture

```
shared/          contrat partagé front/back
  events.ts        AgentEvent + Snapshot (zod)
  tool-stations.json  outil → type de poste → animation
  scenario.ts      scénarios scripté / aléatoire / stress (simulateur et ?mock)
server/          Node (tsx)
  index.ts         HTTP + WebSocket /events + POST /hook + POST /events + démo
  hook-adapter.ts  payload hook Claude Code → AgentEvent
  tracker.ts       agents vivants, rejoués (snapshot) à chaque (re)connexion
src/engine/      moteur générique (ne connaît aucun personnage)
  bitmap, shape, isoPaint   pixels, masques auto-ombrés, primitives iso
  iso.ts           projection 2:1 (tuile 32×16) + tri de profondeur topologique
  pathfinding.ts   A* 4-connexe + murs fins (cloisons)
  agent.ts         position, déplacement, animation d'un agent
  sprite.ts        CharacterDefinition → frames pré-rendues (miroirs, teinte, poof générique)
  loop.ts          boucle rAF plafonnée à 30 fps, arrêtée si document.hidden
src/characters/  un fichier par personnage + registry + kinds.json
src/world/       palette, meubles, plan du bureau (layout.ts), rendu statique
src/scene/       simulation (office.ts), compositeur, caméra, ambiance, bulles
```

La simulation (`src/scene/office.ts`) est de la logique pure, testée avec une horloge factice. Cycle de vie d'un agent :
`spawning → idle ⇄ walking → working ⇄ waiting → done → (returning) → despawning`.

## Format des événements

```ts
type AgentEvent =
  | { type: "agent_spawn"; agentId: string; parentId?: string; kind: AgentKind; label?: string }
  | { type: "agent_tool"; agentId: string; tool: string; summary?: string }
  | { type: "agent_waiting"; agentId: string; reason?: string }
  | { type: "agent_done"; agentId: string }
  | { type: "agent_despawn"; agentId: string };
```

- `AgentKind` : `"claude"` aujourd'hui (et `"robot"` pour la démo). N'importe quelle chaîne est acceptée ; un type inconnu prend le personnage par défaut.
- Envoi direct : `POST /events` avec un `AgentEvent` (ou un tableau). Réponse `202`, ou `400` si invalide.
- Côté écran, le WebSocket `ws://host/events` reçoit les `AgentEvent`, et d'abord un `{ type: "snapshot", agents: [...] }` qui resynchronise l'écran après une (re)connexion. La reconnexion est automatique (1 s → 10 s).
- Robustesse : un événement pour un agent inconnu le crée (`agent_tool`, `agent_waiting`) ou est ignoré (`agent_done`, `agent_despawn`) ; un double `agent_done` est sans effet ; les sous-agents disparaissent avec leur parent.

```bash
curl -X POST localhost:4317/events -H 'content-type: application/json' -d '{"type":"agent_spawn","agentId":"demo","kind":"claude"}'
```

```bash
curl -X POST localhost:4317/events -H 'content-type: application/json' -d '{"type":"agent_tool","agentId":"demo","tool":"Bash","summary":"pnpm test"}'
```

## Ajouter un personnage

1. Créer `src/characters/monperso.ts` qui exporte une `CharacterDefinition` (voir `robot.ts`, ~150 lignes) :
   palette, couleurs non teintées (`fixedColors`), tailles `full` / `mini` (cadre, ancrage des pieds, ombre, tête), animations (réutiliser `STANDARD_ANIMATIONS` et `poseFor()` de `pose.ts` pour le même « feel »), une fonction `draw(bitmap, ctx)` qui dessine une frame de face (SE) ou de dos (NE), et des préférences de pause (`idlePreferences`).
2. L'enregistrer dans `src/characters/index.ts` : `.register(MON_PERSO)`.
3. Associer un `AgentKind` dans `src/characters/kinds.json` : `"codex": "monperso"`.

Le moteur fournit les miroirs SW/NW, les variantes par instance (teinte, accessoire), le poof de spawn/despawn, l'ombre, les bulles et le tri de profondeur. Pour passer plus tard à des spritesheets PNG, il suffit que `draw` copie les pixels d'une image dans le `Bitmap` fourni.

## Ajouter un poste, un meuble ou une pièce

- **Meuble** : une `FurnitureDef` dans `src/world/furniture.ts` (emprise en tuiles, `draw(painter, palette, frame)` avec `box` / `planeX` / `planeY` / `planeZ`). Il apparaît dans la galerie via `ALL_FURNITURE`.
- **Poste** : dans `src/world/layout.ts`, `put(MEUBLE, x, y)` puis `station(id, type, pièce, [{ x, y, dir }])` (cases où se placent les agents et leur orientation). Plusieurs emplacements par poste ; quand ils sont tous pris, les agents attendent à côté.
- **Type de poste / outil** : `shared/tool-stations.json` (`tools` exacts, `prefixes` comme `mcp__`, `animations` par type de poste).
- **Pièce** : ajouter un `Room` (position, taille, sol `planks` | `tiles` | `checker`, tapis optionnel), les `partitions` avec leurs `doors`, et éventuellement `windows` / `posters` / `fairyLights` / `lamps`. Le moteur, le tri de profondeur, l'A* et la caméra s'adaptent tout seuls.

## Étape suivante : brancher Claude Code

Le serveur accepte déjà les payloads bruts des hooks sur `POST /hook` (correspondance détaillée dans `server/hook-adapter.ts`) :

| Hook | Effet à l'écran |
|---|---|
| `SessionStart`, `UserPromptSubmit` | la session apparaît (bureau attitré) |
| `PreToolUse` | l'agent va au poste de l'outil ; `Task` / `Agent` fait apparaître un sous-agent |
| `PostToolUse` (Task), `SubagentStop` | le sous-agent revient faire son rapport puis disparaît |
| `Notification` | bulle « ! » (permission demandée) |
| `Stop` | petit saut de victoire, puis pause café |
| `SessionEnd` | la session disparaît |

Exemple de configuration à ajouter dans `~/.claude/settings.json`, ce qui couvre toutes les sessions Claude Code, terminal comme app desktop. Elle n'est **pas** installée par ce projet :

```json
{
  "hooks": {
    "SessionStart":     [{ "hooks": [{ "type": "command", "command": "curl -s -m 1 -X POST http://localhost:4317/hook -H 'content-type: application/json' --data-binary @- >/dev/null || true" }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "curl -s -m 1 -X POST http://localhost:4317/hook -H 'content-type: application/json' --data-binary @- >/dev/null || true" }] }],
    "PreToolUse":       [{ "matcher": "*", "hooks": [{ "type": "command", "command": "curl -s -m 1 -X POST http://localhost:4317/hook -H 'content-type: application/json' --data-binary @- >/dev/null || true" }] }],
    "PostToolUse":      [{ "matcher": "Task|Agent", "hooks": [{ "type": "command", "command": "curl -s -m 1 -X POST http://localhost:4317/hook -H 'content-type: application/json' --data-binary @- >/dev/null || true" }] }],
    "Notification":     [{ "hooks": [{ "type": "command", "command": "curl -s -m 1 -X POST http://localhost:4317/hook -H 'content-type: application/json' --data-binary @- >/dev/null || true" }] }],
    "Stop":             [{ "hooks": [{ "type": "command", "command": "curl -s -m 1 -X POST http://localhost:4317/hook -H 'content-type: application/json' --data-binary @- >/dev/null || true" }] }],
    "SubagentStop":     [{ "hooks": [{ "type": "command", "command": "curl -s -m 1 -X POST http://localhost:4317/hook -H 'content-type: application/json' --data-binary @- >/dev/null || true" }] }],
    "SessionEnd":       [{ "hooks": [{ "type": "command", "command": "curl -s -m 1 -X POST http://localhost:4317/hook -H 'content-type: application/json' --data-binary @- >/dev/null || true" }] }]
  }
}
```

Le hook reçoit le JSON de l'événement sur stdin ; `curl --data-binary @-` le transmet tel quel. `-m 1` et `|| true` garantissent qu'un écran éteint ne ralentit ni ne bloque jamais Claude Code.

À vérifier lors de l'intégration :
- les appels d'outils faits *dans* un sous-agent ne sont attribués au sous-agent que si le payload porte un `agent_id` ; sinon ils s'affichent sur l'agent de la session ;
- l'app Claude Desktop (chat) n'a pas de hooks : seules les sessions Claude Code, y compris celles de l'app desktop, sont visibles.

## Étape suivante : écran de veille macOS

1. Installer [WebViewScreenSaver](https://github.com/liquidx/webviewscreensaver) : télécharger le `.zip` de la dernière release GitHub, double-cliquer sur `WebViewScreenSaver.saver`. Si macOS le bloque : Réglages système → Confidentialité et sécurité → « Ouvrir quand même ». (Le cask Homebrew est désactivé depuis octobre 2026 car il ne passe plus Gatekeeper.)

2. Lancer le serveur en production au login, relancé automatiquement s'il s'arrête (LaunchAgent `com.agent-office.server`, logs dans `~/Library/Logs/agent-office.log`) :

   ```bash
   scripts/launchagent.sh install
   ```

   `scripts/launchagent.sh status` pour vérifier, `scripts/launchagent.sh uninstall` pour retirer. Relancer `install` après une mise à jour du code (rebuild + rechargement). `DEMO=0 scripts/launchagent.sh install` désactive la démo.

3. Réglages système → Économiseur d'écran → WebViewScreenSaver → Options → URL `http://localhost:4317/`.

La page est déjà en mode écran de veille : plein écran, curseur masqué, aucune interaction, fond sombre, scale entier automatique, rendu arrêté quand la page est cachée.

## Qualité

- `docs/art-direction.md` : charte (palette, lumière, contours, proportions, décisions de design).
- `docs/qa-report.md` : critères d'acceptation, résultats des tests, mesures de performance, bugs trouvés et corrigés.
- `docs/screenshots/` : captures de chaque jalon et de la QA (4 résolutions).

Hors périmètre de ce prototype : vrais hooks installés, packaging `.saver`, interactions souris, sons, persistance, authentification.
