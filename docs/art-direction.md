# Charte artistique — Agent Office

## Intention
Un petit diorama de bureau, la nuit, vu en iso 2:1. Ambiance cozy : bois miel, murs prune, lumière chaude d'une lampe, clair de lune par la fenêtre, guirlande lumineuse. Lisible d'un coup d'œil comme Mini Motorways : peu de détails, silhouettes nettes, couleurs d'accent réservées à ce qui compte (personnages, écrans, alertes).

## Rendu
- Résolution interne **480×270**, agrandie d'un **facteur entier** (×2 en 1080p, ×4 en 4K…), `image-rendering: pixelated`, `imageSmoothingEnabled = false`. Jamais d'interpolation, de rotation, ni de mise à l'échelle non entière d'un sprite.
- Projection **dimétrique 2:1** : tuile 32×16 px. Axe grille `+x` → bas-droite (SE), `+y` → bas-gauche (SW). 1 tuile = 16 unités monde ; `z` = pixels écran.
- Les arêtes iso sont rastérisées par « centre de pixel dans le polygone » → escaliers 2:1 parfaits, sans pixel orphelin.

## Palette de scène (24 couleurs)
Définie dans `src/art/palette.ts` : **palette A chaude** (prune + miel), retenue en revue de design.

| Rôle | Clés |
|---|---|
| Fond nuit | `night0`, `night1` |
| Contour / yeux | `ink` |
| Murs | `wall0` (mur NW, à l'ombre), `wall1` (mur NE, éclairé), `wall2` (moulures) |
| Bois | `wood0` → `wood3` (du plus sombre au plus clair) |
| Lumière | `cream`, `white`, `butter` |
| Accents | `coral0/1`, `blush`, `red`, `mint0/1`, `leaf0/1`, `sky0/1/2` |

Les personnages ont **leur propre palette** (définie dans leur fichier), pour rester extensibles ; les emotes partagées (bulle « ! », étincelles, poof, accessoires) n'utilisent que la palette de scène.

## Lumière et ombres
- **Lumière clé chaude en haut à gauche.** Faces de boîte : dessus = clair, face gauche (+y) = moyen, face droite (+x) = sombre. Arête avant du dessus soulignée d'un liseré clair (`edge`).
- Formes organiques (personnages, feuillages, fumée) : ombrage automatique `paintShape` — contour intérieur 1 px, liseré clair haut/gauche, liseré d'ombre bas/droite.
- Pas de dégradés : la lumière est faite de **tramage ordonné (Bayer 4×4)** entre deux teintes voisines de la palette (flaque de la lampe, clair de lune, vignettage du fond, ombres portées).
- Ombres portées des meubles décalées vers +x/+y ; ombre au sol des personnages = ellipse tramée `ink` à 60 %.

## Contours
- Meubles : contour **extérieur** 1 px `ink`.
- Personnages : contour **intérieur** 1 px dans la teinte la plus sombre de leur matière (jamais noir pur) → silhouette lisible sur fond sombre sans durcir le style.
- Sol, murs, tapis : pas de contour.

## Personnages
- **Proportions** : grosse tête / gros corps, membres minuscules. Taille normale ≈ 18×20 px utiles (cadre 32×44 avec marge pour bulle et saut). Les **sous-agents** utilisent une silhouette dédiée à ~60 % (cadre 22×30), pas un redimensionnement (qui flouterait les pixels).
- **Expressivité avec peu de pixels** : yeux 2×3 (1×2 en mini), joues `blush`, bouche seulement quand l'émotion l'exige. États : yeux ouverts, clignement, concentré (yeux plissés), regard levé (attente), « ^ ^ » (done).
- **Directions** : SE/SW montrent le visage, NE/NW le dos. Seuls SE et NE sont dessinés ; SW/NW sont des miroirs.
- **Animations** (timings partagés dans `src/characters/pose.ts`) : `idle` (respiration + clignement), `walk` (rebond + pattes alternées), `work_type`, `work_read` (livre), `work_terminal` (frappe rapide + reflet), `waiting` (main levée + bulle « ! »), `done` (saut + étincelles), `spawn`/`despawn` (poof générique fourni par le moteur).
- **Variantes par instance** : rotation de teinte (couleurs marquées `fixedColors` épargnées) + accessoire (pousse, nœud, chapeau, fleur).

## Décisions de la revue de design
- **Mascotte : Clawd** (corps rectangulaire sur quatre pattes, filiation avec la mascotte terminal).
- **Palette : A chaude** (prune + miel).
La variante chibi et la palette froide proposées au jalon 2 ont été retirées du code.

## Décor
Monde en L de 24×17 tuiles, trois pièces séparées par des cloisons basses (montants de porte crème) :
- **Open space** (parquet) : 9 bureaux doubles = 18 places, écrans au code qui défile, fenêtre, boîte aux lettres.
- **Labo** (carrelage mauve, tapis) : bibliothèques, baies serveur + terminal (LED), tableau blanc, fenêtre.
- **Cafétéria** (damier bois) : machines à expresso fumantes, tables (mug, gâteau), canapé, fenêtre, guirlande.
Murs arrière NE et NW (papier peint à pois, affiche étoile, guirlandes), bords avant ouverts façon diorama avec tranche de plancher, flaques de lumière tramées des lampes et clair de lune.

## Lisibilité de l'activité
- Au travail : à son poste, animation propre à l'outil.
- En attente de permission : bulle « ! » et main levée.
- Inactif : va à la cafétéria ; « zzz » après 12 s sans travail.
- Dialogue : bulles à faux texte (traits gris, un mot corail, « ? » pour une question) au briefing d'un sous-agent, à son rapport, et pendant les pauses café.

## Ajouter un asset
- Sprites procéduraux : masques (`Mask`) + `paintShape`, petites matrices de caractères (`paintMatrix`), primitives iso (`IsoPainter.box/planeX/planeY/planeZ`).
- Un futur spritesheet PNG pourra remplacer `CharacterDefinition.draw` en copiant les pixels d'une image dans le `Bitmap` fourni : le reste du moteur ne voit que des `Bitmap`.
