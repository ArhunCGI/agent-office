# Charte artistique — Agent Office

## Intention
Un petit diorama de bureau, la nuit, vu en iso 2:1. Ambiance cozy : bois miel, murs prune, lumière chaude d'une lampe, clair de lune par la fenêtre, guirlande lumineuse. Lisible d'un coup d'œil comme Mini Motorways : peu de détails, silhouettes nettes, couleurs d'accent réservées à ce qui compte (personnages, écrans, alertes).

## Rendu
- Résolution interne **480×270**, agrandie d'un **facteur entier** (×2 en 1080p, ×4 en 4K…), `image-rendering: pixelated`, `imageSmoothingEnabled = false`. Jamais d'interpolation, de rotation, ni de mise à l'échelle non entière d'un sprite.
- Projection **dimétrique 2:1** : tuile 32×16 px. Axe grille `+x` → bas-droite (SE), `+y` → bas-gauche (SW). 1 tuile = 16 unités monde ; `z` = pixels écran.
- Les arêtes iso sont rastérisées par « centre de pixel dans le polygone » → escaliers 2:1 parfaits, sans pixel orphelin.

## Palette de scène (24 couleurs)
Définie dans `src/art/palette.ts`. Variante **A chaude** (défaut) et **B froide** (seuls murs, bois et fond changent ; les accents sont communs).

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

## Variantes à valider (galerie)
1. **Mascotte Claude** — **A « Clawd »** : corps rectangulaire sur quatre pattes, filiation avec la mascotte terminal. **B « Bloop »** : chibi, tête ronde, antenne en étoile façon logo, grands yeux brillants.
2. **Palette de pièce** — **A chaude** (prune + miel) ou **B froide** (ardoise + chêne fumé).

## Décor
Pièce 10×9 tuiles, murs arrière NE (fenêtre, guirlande, papier peint à pois) et NW (affiche étoile), bords avant ouverts façon diorama avec tranche de plancher. Postes : 2 bureaux doubles avec écrans (code qui défile), bibliothèque, baies serveur + petit terminal (LED qui clignotent), tableau blanc (organigramme + post-it), coin café (canapé, machine à expresso fumante), boîte aux lettres (drapeau levé quand il y a du courrier), fenêtre (clair de lune). Déco : grande et petite plantes, lampe sur pied, tapis central.

## Ajouter un asset
- Sprites procéduraux : masques (`Mask`) + `paintShape`, petites matrices de caractères (`paintMatrix`), primitives iso (`IsoPainter.box/planeX/planeY/planeZ`).
- Un futur spritesheet PNG pourra remplacer `CharacterDefinition.draw` en copiant les pixels d'une image dans le `Bitmap` fourni : le reste du moteur ne voit que des `Bitmap`.
