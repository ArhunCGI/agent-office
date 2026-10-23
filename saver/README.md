# Agent Office — économiseur d'écran macOS (app extension)

Économiseur d'écran natif qui affiche la scène Agent Office (`http://localhost:4317/`) en plein écran.

Il est construit comme une **app extension** (`.appex`, point d'extension `com.apple.screensaver`), le format des économiseurs Apple (Hello, Flurry, Drift…), et non comme un `.saver` hérité : depuis macOS 26, le moteur `legacyScreenSaver` des `.saver` tiers retombe sur Hello en plein écran (cf. WebViewScreenSaver, issue #97).

Basé sur [AppexSaverMinimal](https://github.com/AerialScreensaver/AppexSaverMinimal) de Guillaume Louel (licence MIT, voir `LICENSE` et `UPSTREAM-README.md`). Changements : vue web plein écran à la place de l'arc-en-ciel, identifiants `dev.agent-office.saver`, accès réseau sortant (sandbox), ATS `NSAllowsLocalNetworking`, pas de feuille d'options, signature locale par défaut.

## Installer

Prérequis : Xcode, et le serveur Agent Office lancé (`scripts/launchagent.sh install` à la racine du dépôt).

```bash
saver/install.sh
```

Le script compile en Release avec la **signature locale** (aucun compte Apple Developer), copie l'app dans `~/Applications/AgentOfficeSaver.app`, l'enregistre auprès de PlugInKit et redémarre `WallpaperAgent`. Ensuite : Réglages Système → Fond d'écran → Économiseur d'écran → **Agent Office**.

Désinstaller : `saver/install.sh uninstall`.

URL personnalisée (par défaut `http://localhost:4317/`) : clé `url` du domaine `dev.agent-office.saver.Extension` (lu via `ScreenSaverDefaults` depuis le conteneur sandbox de l'extension).

## Limites

- **API privée** : Apple n'a pas documenté ce point d'extension pour les tiers ; une mise à jour de macOS peut le casser. Distribution hors App Store uniquement ; pour d'autres Mac, signer avec un Developer ID et notariser.
- **Mac gérés (MDM)** : un profil de configuration qui impose `com.apple.screensaver` → `moduleName` (par ex. `Hello`) l'emporte sur le choix fait dans les Réglages : l'aperçu affiche Agent Office mais le plein écran lance l'économiseur imposé. Vérifier avec `plutil -p "/Library/Managed Preferences/com.apple.screensaver.plist"`. Seul l'administrateur MDM peut lever cette contrainte.
- Diagnostic : `log stream --predicate 'subsystem BEGINSWITH "dev.agent-office"'` montre le chargement de l'extension et de la page.
