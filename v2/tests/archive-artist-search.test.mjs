import assert from 'node:assert/strict';
import test from 'node:test';
import {artistSearchText,indexArtistNames,matchesSearch,searchTerms} from '../music-library/artist-search.mjs';

const credits=['حامد نیک‌پی','داریوش','داریوش اقبالی','داریوش رفیعی','شاهین نجفی و عرفان','رامین سهرابی','Sina Sarlak'];
const names=indexArtistNames(credits);
const find=query=>credits.filter(credit=>matchesSearch(artistSearchText(credit),searchTerms(query,names)));

test('Bilingual artist names return the same catalog artist in either spelling',()=>{
  for(const query of ['حامد نیک‌پی','حامد نیک پی','حامدنيكپي','Hamed Nikpay','Hamed Nik Pay','hamed-nikpey','HamedNikPay']){
    assert.deepEqual(find(query),['حامد نیک‌پی'],query);
  }
});

test('A stage name links its own full credit and preserves a collaborator credit',()=>{
  assert.deepEqual(find('Dariush Eghbali'),['داریوش','داریوش اقبالی']);
  assert.deepEqual(find('Shahin Najafi'),['شاهین نجفی و عرفان']);
  assert.deepEqual(find('Erfan Paydar'),['شاهین نجفی و عرفان']);
  const terms=searchTerms('Hamed Nikpay جهان رو به زوال',names);
  assert.ok(matchesSearch('جهان رو به زوال '+artistSearchText('حامد نیک‌پی'),terms));
  assert.ok(!matchesSearch('تک‌آهنگ '+artistSearchText('حامد نیک‌پی'),terms));
});

test('Transliteration can find a unique credit in either direction',()=>{
  assert.deepEqual(find('Ramin Sohrabi'),['رامین سهرابی']);
  assert.deepEqual(find('سینا سرلک'),['Sina Sarlak']);
  const ambiguous=indexArtistNames(['رامین سهرابی','رامان سهرابی']);
  assert.deepEqual(searchTerms('Ramin Sohrabi',ambiguous),[['ramin','sohrabi']]);
});
