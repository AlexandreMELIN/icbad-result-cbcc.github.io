import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedUrl, parseScores, parseCompetitionHtml } from '../scrape.mjs';

const SOURCE = 'https://icbad.ffbad.org/competition/2500653';
const html = `<!doctype html><html><body>
  <table><tr><th>Equipe</th><th>Points</th></tr>
         <tr><td>Conquerant Badminton Club Caen (14-CBCC-4)</td><td>19</td></tr></table>
  <table>
    <tr><th></th><th>1.</th><th>2.</th><th>3.</th></tr>
    <tr><th></th><th>76-HAC-2</th><th>14-CBCC-4</th><th>14-ESF-2</th></tr>
    <tr><th>1.</th><td></td><td><a href="/match/11">J1 : 7-1</a></td><td>J2 : 4-4</td></tr>
    <tr><th>2.</th><td><a href="/match/11">J1 : 1-7</a></td><td></td>
        <td><a href="/match/12">J2 : 5-3</a> <a href="/match/13">J5 : 4-4</a></td></tr>
    <tr><th>3.</th><td>J2 : 4-4</td><td>J2 : 3-5 J5 : 4-4</td><td></td></tr>
  </table>
</body></html>`;

test('parse les journées, plusieurs matchs dans une cellule', () => {
  assert.deepEqual(parseScores('J1 : 7-1 J 05 : 4–4'), [{journee:1, score:'7-1'},{journee:5,score:'4-4'}]);
});
test('filtre les rencontres CBCC et les scores de sa ligne', () => {
  const data = parseCompetitionHtml(html, 'Régionale 1', SOURCE);
  assert.equal(data.matrices, 1);
  assert.deepEqual(data.rencontres.map(r=>[r.journee,r.equipe,r.adversaire,r.score,r.statut]), [
    [1,'CBCC 4','76-HAC-2','1-7','Défaite'],
    [2,'CBCC 4','14-ESF-2','5-3','Victoire'],
    [5,'CBCC 4','14-ESF-2','4-4','Nul']
  ]);
  assert.equal(data.rencontres[0].source, 'https://icbad.ffbad.org/match/11');
});
test('rejette les liens extérieurs et formats imprévus', () => {
  assert.throws(() => checkedUrl('https://example.com/competition/123'));
  assert.throws(() => checkedUrl('https://icbad.ffbad.org/instance/NORM'));
  assert.equal(checkedUrl(SOURCE), SOURCE);
});
