
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as cheerio from 'cheerio';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'https://icbad.ffbad.org';

const TEAM_CODE = /\b(?:\d{2}-[A-Z0-9]{2,12}|[A-Z0-9]{2,12}\d{2})-\d{1,3}\b/i;
const DAY_SCORE = /\bJ\s*0*(\d{1,2})\s*:\s*(\d{1,2}\s*[-–]\s*\d{1,2}|forfait|W\.?O\.?|à venir)/gi;

const tidy = s => String(s ?? '').replace(/\s+/g, ' ').trim();

const teamCode = text =>
  tidy(text).match(TEAM_CODE)?.[0]?.toUpperCase() || null;

const teamNumber = team =>
  String(team || '').match(/^(?:14-CBCC-|CBCC14-|CBCC-)(\d+)$/i)?.[1] || null;

export function checkedUrl(input) {
  const url = new URL(input);

  if (
    url.origin !== ORIGIN ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/competition\/\d+\/?$/.test(url.pathname)
  ) {
    throw new Error('URL ICBad invalide : ' + String(input));
  }

  return url.href;
}

function matchUrl(href, fallback) {
  if (!href) return fallback;

  try {
    const url = new URL(href, fallback);

    return url.origin === ORIGIN &&
      !url.username &&
      !url.password &&
      !url.hash
      ? url.href
      : fallback;
  } catch {
    return fallback;
  }
}

export function parseScores(text) {
  const result = [];

  for (const hit of tidy(text).matchAll(DAY_SCORE)) {
    const day = Number(hit[1]);

    if (day < 1 || day > 40) continue;

    const match = hit[2].match(
      /^(\d{1,2})\s*[-–]\s*(\d{1,2})$/
    );

    const score = match
      ? `${Number(match[1])}-${Number(match[2])}`
      : '';

    result.push({
      journee: day,
      score
    });
  }

  return result;
}

export function parseCompetitionHtml(
  html,
  division,
  competitionUrl
) {
  const $ = cheerio.load(html);
  const results = new Map();

  let matrices = 0;

  // Nouveau parsing : matrices avec codes courts.
  // Exemple : CBCC-6, ESF-3, ASLI-1.

  $('table.matrice').each((_i, table) => {
    const rows = $(table).children('tbody').length
      ? $(table).children('tbody').children('tr').toArray()
      : $(table).children('tr').toArray();

    const cells = tr =>
      $(tr).children('th,td').toArray();

    if (rows.length < 3) return;

    // Première ligne : noms complets dans les attributs title.
    // Deuxième ligne : codes courts des équipes.

    const codeCells = cells(rows[1]);
    const topCells = cells(rows[0]).slice(1);

    const teams = codeCells.map((el, i) => {
      const code = tidy($(el).text())
        .match(/\b([A-Z0-9]{2,15}-\d{1,3})\b/i)
        ?.[1]
        ?.toUpperCase();

      const title = tidy(
        $(topCells[i]).find('a[title]').attr('title') ||
        $(el).find('a[title]').attr('title') ||
        ''
      );

      const name = title
        .replace(/\s*\([^)]*\)\s*$/, '')
        .trim();

      return { code, name };
    });

    if (
      teams.length < 2 ||
      teams.some(team => !team.code)
    ) {
      return;
    }

    matrices++;

    // Parcours de chaque ligne de la matrice.

    for (const tr of rows.slice(2)) {
      const rowCells = cells(tr);

      const rowIndex = Number(
        tidy($(rowCells[0]).text()).replace(/\.$/, '')
      ) - 1;

      if (
        !Number.isInteger(rowIndex) ||
        rowIndex < 0 ||
        rowIndex >= teams.length
      ) {
        continue;
      }

      const ours = teams[rowIndex];

      // On ne traite que les équipes CBCC.
      const cbcc = ours.code.match(/^CBCC-(\d{1,3})$/i);

      if (!cbcc) continue;

      for (let col = 0; col < teams.length; col++) {
        if (col === rowIndex) continue;

        const opponent = teams[col];
        const cell = $(rowCells[col + 1]);

        if (!cell.length) continue;

        const links = cell
          .find('a[href*="/rencontre/"]')
          .toArray();

        for (const a of links) {
          const href = $(a).attr('href');

          for (const item of parseScores($(a).text())) {
            const [home, away] = item.score
              ? item.score.split('-').map(Number)
              : [null, null];

            const status = home === null
              ? 'À confirmer'
              : home > away
                ? 'Victoire'
                : home < away
                  ? 'Défaite'
                  : 'Nul';

            const rec = {
              equipe: `CBCC ${cbcc[1]}`,
              division,
              adversaire: opponent.code,
              journee: item.journee,
              score: item.score,
              statut: status,
              source: matchUrl(href, competitionUrl)
            };

            const key = [
              division,
              ours.code,
              opponent.code,
              item.journee,
              item.score,
              rec.source
            ].join('|');

            if (!results.has(key)) {
              results.set(key, rec);
            }
          }
        }
      }
    }
  });

  // Compatibilité avec les matrices historiques
  // qui utilisent des identifiants longs : 14-CBCC-6.

  $('table').not('.matrice').each((_i, table) => {
    const rows = $(table)
      .find('tr')
      .filter((_j, tr) =>
        $(tr).closest('table')[0] === table
      )
      .toArray();

    const cells = row =>
      $(row).children('td,th').toArray();

    const isNumericRow = row =>
      /^\d+\s*\.?$/.test(
        tidy($(cells(row)[0]).text())
      );

    for (
      let headerIndex = 0;
      headerIndex < rows.length;
      headerIndex++
    ) {
      const header = cells(rows[headerIndex]);

      const codes = header.map(cell =>
        teamCode($(cell).text())
      );

      const teams = codes.filter(Boolean);

      if (
        teams.length < 2 ||
        teams.length > 24 ||
        new Set(teams).size !== teams.length
      ) {
        continue;
      }

      let seenNumericRows = 0;

      for (const tr of rows.slice(headerIndex + 1)) {
        if (!isNumericRow(tr)) {
          if (seenNumericRows > 0) break;
          continue;
        }

        const rowCells = cells(tr);

        const ordinal = Number(
          tidy($(rowCells[0]).text()).replace('.', '')
        );

        const rowTeam = teams[ordinal - 1];

        seenNumericRows++;

        const number = teamNumber(rowTeam);

        if (!number) continue;

        for (
          let c = 0;
          c < Math.min(codes.length, rowCells.length);
          c++
        ) {
          const opponent = codes[c];

          if (!opponent || opponent === rowTeam) {
            continue;
          }

          const cell = $(rowCells[c]);

          const linked = cell.find('a').toArray()
            .flatMap(a =>
              parseScores($(a).text()).map(s => ({
                ...s,
                url: $(a).attr('href')
              }))
            );

          const plain = parseScores(cell.text());

          const entries = plain.map(s => ({
            ...s,
            url: linked.find(l =>
              l.journee === s.journee &&
              l.score === s.score
            )?.url
          }));

          for (const s of entries) {
            const [ours, theirs] = s.score
              ? s.score.split('-').map(Number)
              : [null, null];

            const status = ours === null
              ? 'À confirmer'
              : ours > theirs
                ? 'Victoire'
                : ours < theirs
                  ? 'Défaite'
                  : 'Nul';

            const rec = {
              equipe: `CBCC ${number}`,
              division,
              adversaire: opponent,
              journee: s.journee,
              score: s.score,
              statut: status,
              source: matchUrl(s.url, competitionUrl)
            };

            const key = [
              division,
              rowTeam,
              opponent,
              s.journee,
              s.score
            ].join('|');

            if (!results.has(key)) {
              results.set(key, rec);
            }
          }
        }
      }

      if (seenNumericRows > 0) {
        matrices++;
      }

      break;
    }
  });

  return {
    rencontres: [...results.values()],
    matrices
  };
}

async function fetchPage(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent':
        'CBCC-resultats/1.0 (association sportive; consultation ponctuelle)'
    },
    signal: AbortSignal.timeout(25000),
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new Error(`ICBad HTTP ${response.status}`);
  }

  if (new URL(response.url).origin !== ORIGIN) {
    throw new Error('Redirection vers un autre domaine');
  }

  const reportedSize = Number(
    response.headers.get('content-length') || 0
  );

  if (reportedSize > 4_000_000) {
    throw new Error('Réponse trop volumineuse');
  }

  const body = await response.text();

  if (body.length > 4_000_000) {
    throw new Error('Page trop volumineuse');
  }

  return body;
}

export async function update() {
  const cfg = JSON.parse(
    await readFile(
      path.join(ROOT, 'competitions.json'),
      'utf8'
    )
  );

  if (!/^20\d{2}-20\d{2}$/.test(cfg.saison)) {
    throw new Error('Saison invalide');
  }

  if (!Array.isArray(cfg.competitions)) {
    throw new Error(
      'competitions.json : tableau compétitions absent'
    );
  }

  const status = {
    saison: cfg.saison,
    club: cfg.club || '14-CBCC',
    generated_at: new Date().toISOString(),
    status: 'ok',
    competitions: [],
    warnings: [],
    rencontres: []
  };

  let configured = 0;
  let succeeded = 0;

  for (const c of cfg.competitions) {
    const division = tidy(c.division);

    if (!division) {
      throw new Error(
        'Division sans nom dans competitions.json'
      );
    }

    const sources = Array.isArray(c.urls)
      ? c.urls
      : [c.url];

    const urls = sources
      .filter(Boolean)
      .map(checkedUrl);

    if (urls.length === 0) {
      status.competitions.push({
        division,
        statut: 'non_configuree',
        rencontres: 0
      });

      status.warnings.push(
        `${division} : URL non renseignée`
      );

      continue;
    }

    for (const url of urls) {
      configured++;

      try {
        const html = await fetchPage(url);

        const parsed = parseCompetitionHtml(
          html,
          division,
          url
        );

        if (parsed.matrices === 0) {
          throw new Error(
            'Aucune matrice de rencontres détectée : format HTML à vérifier'
          );
        }

        succeeded++;

        status.rencontres.push(
          ...parsed.rencontres
        );

        status.competitions.push({
          division,
          statut: 'ok',
          rencontres: parsed.rencontres.length,
          url
        });

        console.log(
          `[OK] ${division} : ` +
          `${parsed.rencontres.length} rencontre(s), ` +
          `${parsed.matrices} matrice(s)`
        );

      } catch (err) {
        status.competitions.push({
          division,
          statut: 'erreur',
          rencontres: 0,
          url
        });

        status.warnings.push(
          `${division} : ${err.message}`
        );

        console.error(
          `[ERREUR] ${division} : ${err.message}`
        );
      }

      await new Promise(resolve =>
        setTimeout(resolve, 900)
      );
    }
  }

  // Déduplication des rencontres.
  const dedup = new Map();

  for (const r of status.rencontres) {
    const key = [
      r.division,
      r.equipe,
      r.adversaire,
      r.journee,
      r.score,
      r.source
    ].join('|');

    if (!dedup.has(key)) {
      dedup.set(key, r);
    }
  }

  status.rencontres = [...dedup.values()]
    .sort((a, b) =>
      a.journee - b.journee ||
      a.equipe.localeCompare(
        b.equipe,
        'fr',
        { numeric: true }
      )
    );

  if (
    configured > 0 &&
    succeeded > 0 &&
    status.rencontres.length === 0
  ) {
    status.warnings.push(
      'Aucun score CBCC trouvé dans les compétitions accessibles.'
    );
  }

  status.status = configured === 0
    ? 'not_configured'
    : succeeded === 0
      ? 'unavailable'
      : status.warnings.length
        ? 'partial'
        : 'ok';

  if (configured === 0) {
    status.warnings.unshift(
      'Aucune URL de compétition renseignée.'
    );
  }

  if (status.status === 'unavailable') {
    throw new Error(
      'Aucune compétition récupérée : publication annulée.'
    );
  }

  await mkdir(
    path.join(ROOT, 'data'),
    { recursive: true }
  );

  await writeFile(
    path.join(ROOT, 'data/results.json'),
    JSON.stringify(status, null, 2) + '\n',
    'utf8'
  );

  console.log(
    `Terminé : ${status.status}, ` +
    `${status.rencontres.length} rencontre(s), ` +
    `${status.warnings.length} avertissement(s)`
  );

  return status;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    fileURLToPath(import.meta.url)
) {
  update().catch(err => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
