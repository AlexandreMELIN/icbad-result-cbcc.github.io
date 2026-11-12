# Résultats ICBad — CBCC

Une page web **compatible téléphone et ordinateur**, hébergée gratuitement sur **GitHub Pages**, avec des résultats récupérés automatiquement par un script **JavaScript/Node.js dans GitHub Actions**. Pas de Python, de backend permanent, de base de données ni de proxy public.

## Installation (une seule fois, par la personne qui gère le dépôt)

1. Sur GitHub, créez un dépôt **public**, par exemple `resultats-cbcc` (branche par défaut `main`).
2. Décompressez le ZIP et ajoutez **tous les fichiers à la racine** du dépôt, y compris `.github/workflows/pages.yml` (dossier masqué sur certains ordinateurs). GitHub permet aussi d'ajouter des fichiers avec l'interface Web.
3. Dans **Settings → Pages → Build and deployment**, choisissez **Source : GitHub Actions**. Si vous remplacez une ancienne version, supprimez les anciens workflows concurrents dans `.github/workflows/`.
4. Dans `competitions.json`, remplissez les URL des compétitions **2026-2027**. Les identifiants changent suivant la saison, donc aucune URL 2026-2027 n'a été inventée.
5. Sur GitHub, ouvrez **Actions → Actualiser les résultats CBCC et publier → Run workflow**. L'exécution récupère les données, génère le JSON et publie le site.
6. Le site sera accessible à une URL du type `https://VOTRE-COMPTE.github.io/resultats-cbcc/`. Partagez uniquement ce lien avec les membres de la commission.

> Le premier déploiement fonctionne même si aucune URL n'a encore été configurée : la page affichera un message d'administration, mais aucun résultat fictif.

## Comment trouver les URL ICBad ?

Sur <https://icbad.ffbad.org/>, retrouvez la compétition (Pré-Nationale, R1, R2, D1, Challenge), puis copiez son URL de type `https://icbad.ffbad.org/competition/1234567` et collez-la dans `competitions.json`.

Format :

```json
{
  "saison": "2026-2027",
  "club": "14-CBCC",
  "competitions": [
    { "division": "Pré-Nationale", "url": "https://icbad.ffbad.org/competition/IDENTIFIANT" },
    { "division": "Régionale 1", "url": "" },
    { "division": "Régionale 2", "url": "" },
    { "division": "Départementale 1", "url": "" },
    { "division": "Challenge", "url": "" }
  ]
}
```

**Attention :** l'URL ci-dessus avec `IDENTIFIANT` est un exemple explicatif, pas une URL valide. Les chaînes vides sont volontairement ignorées.

Si une division comporte plusieurs compétitions (plusieurs URL), vous pouvez utiliser `"urls": ["https://icbad.ffbad.org/competition/1234567", "https://icbad.ffbad.org/competition/7654321"]` à la place de `"url"`.

Les anciens identifiants **2025-2026** connus, à ne PAS recopier pour 2026-2027 : Pré-Nationale `2500652`, R1 `2500653`, R2 `2500655`, D1 `2503050`, Challenge `2503934`.

## Utilisation par la commission

Les bénévoles n'utilisent **ni GitHub, ni le scraper** : ils ouvrent le lien du site sur téléphone ou PC, choisissent la journée et éventuellement la division, consultent les résultats et touchent **Copier le texte**. Un bouton permet l'export CSV. Les textes sont modifiables avant copie.

Le site affiche la dernière heure d'actualisation. Il indique si l'extraction a été partielle, ou si les données datent de plus de 48 heures. Les scores à confirmer ne figurent pas dans le texte prêt à publier.

## Actualisation automatique et limites

- Le workflow se déclenche à chaque `push` sur `main`, manuellement via **Run workflow** et **4 fois par jour** à `09:17`, `13:17`, `17:17` et `21:17` UTC (les horaires locaux changent avec l'heure d'été).
- GitHub peut retarder ou occasionnellement sauter une exécution programmée. Le site n'est **pas en temps réel**.
- GitHub Actions fait les requêtes côté Node.js : **aucun CORS** côté navigateur. Le site HTML charge uniquement `data/results.json` depuis GitHub Pages.
- **Première récupération live non vérifiée :** cet environnement ne pouvait pas accéder à ICBad. Le parseur s'appuie sur la structure des tableaux connue par indexation ; des tests synthétiques sont fournis pour exécution sur GitHub. Les sélecteurs peuvent devoir être ajustés après lecture des logs GitHub.
- Si **toutes** les requêtes échouent, la publication est annulée : le déploiement précédent reste disponible, mais son horodatage devient ancien. Si seulement certaines échouent, la page affiche un avertissement.
- Les rencontres de phases finales sans numéro de journée et les informations absentes de la matrice ne sont pas reprises. Ne pas utiliser l'outil comme preuve officielle : vérifier ICBad avant publication.
- Vérifiez les conditions d'utilisation des pages ICBad ; le script est volontairement modéré (quelques requêtes par jour, pause entre requêtes).

## Pour un développeur : tests locaux

Avec Node.js 22 ou supérieur :

```bash
npm install
npm test
npm run update
```

Pour prévisualiser la page, servez le dossier avec un petit serveur de fichiers statiques (par exemple `npx serve .`). `index.html` ne doit pas être ouvert en `file://` à cause des contraintes de `fetch()` locales.

Structure :

```text
index.html                  # Interface responsive, sans framework
competitions.json          # URLs ICBad à renseigner une fois
scrape.mjs                 # Récupération et parsing Node.js
package.json               # Cheerio pour lire les tableaux HTML
data/results.json          # Derniers résultats générés (sans données fictives)
tests/parser.test.mjs      # Tests unitaires sur une structure HTML exemple
.github/workflows/pages.yml # Synchronisation + publication GitHub Pages
```
