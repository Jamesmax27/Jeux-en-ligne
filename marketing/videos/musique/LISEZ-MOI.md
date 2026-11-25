# Pistes de musique fournies

Par défaut, la musique des vidéos est composée par le script (`scripts/videos/musique.mjs`) : rien à déposer ici.

Pour utiliser une piste à soi, la déposer dans ce dossier (WAV, MP3, M4A ou OGG), puis :

```
node scripts/videos/video.mjs presentation --accroche mur-de-jeux --jeux toboggan-turbo,bouge-l-eau --textes direct --musique ma-piste.mp3
```

ou ajouter `"musique": "ma-piste.mp3"` à une recette de `marketing/videos/presentations/`.

La piste est coupée à la durée de la vidéo, fondue à la fin et mise au même niveau que les autres vidéos ; les bruitages des coupes et des textes sont ajoutés par-dessus. Les coupes du montage suivent le tempo du rythme choisi (`gabarit.json`), pas celui de la piste : choisir un rythme au tempo proche.

N'y déposer que des pistes dont on a tous les droits (compositions originales ou licence qui permet la publicité sur TikTok, YouTube et Instagram).
