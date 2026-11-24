const aliases = [
  ['داریوش', 'داریوش اقبالی', 'Dariush', 'Darioush', 'Daryoush', 'Dariush Eghbali', 'Dariush Eqbali'],
  ['حامد نیک‌پی', 'Hamed Nikpay', 'Hamed Nik Pay', 'Hamed Nikpey', 'Hamed Nik Pey'],
  ['شاهین نجفی', 'Shahin Najafi'],
  ['مارتیک', 'Martik', 'Martic'],
  ['ابی', 'Ebi', 'Eby'],
  ['معین', 'Moein', 'Moin'],
  ['گوگوش', 'Googoosh', 'Googosh'],
  ['مهستی', 'Mahasti'],
  ['هایده', 'Hayedeh', 'Hayede', 'Haideh'],
  ['حمیرا', 'Homeyra', 'Homayra', 'Humeyra'],
  ['سیاوش قمیشی', 'Siavash Ghomayshi', 'Siavash Ghomeishi'],
  ['اندی', 'Andy', 'Andranik Madadian'],
  ['بیژن مرتضوی', 'Bijan Mortazavi', 'Bijan Mortazawi'],
  ['محمدرضا شجریان', 'محمد رضا شجریان', 'Mohammad Reza Shajarian', 'Mohammadreza Shajarian'],
  ['شهرام ناظری', 'Shahram Nazeri'],
  ['ایرج بسطامی', 'Iraj Bastami'],
  ['ناصر رزازی', 'Naser Razazi', 'Nasir Razazi'],
  ['حسن زیرک', 'Hassan Zirak', 'Hasan Zirak'],
  ['حبیب', 'Habib', 'Habib Mohebian'],
  ['فرهاد', 'Farhad', 'Farhad Mehrad'],
  ['عرفان', 'Erfan', 'Erfan Paydar'],
];

function normalizeSearch(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase()
    .replace(/[يى]/g, 'ی').replaceAll('ك', 'ک').replaceAll('\u0640', '')
    .normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const keyOf = value => normalizeSearch(value).replaceAll(' ', '');
const aliasByKey = new Map(aliases.flatMap(group => group.map(name => [keyOf(name), group])));
const namesIn = credit => String(credit ?? '').split(/\s*(?:[&,،]|\s+(?:و|and|feat\.?|ft\.?)\s+)\s*/iu);
const arabic = value => /\p{Script=Arabic}/u.test(value);
const roman = {ب:'b',پ:'p',ت:'t',ط:'t',ث:'s',ج:'j',چ:'č',ح:'h',خ:'x',د:'d',ذ:'z',ر:'r',ز:'z',ژ:'ž',س:'s',ش:'š',ص:'s',ض:'z',ظ:'z',غ:'q',ق:'q',ف:'f',ک:'k',گ:'g',ل:'l',م:'m',ن:'n',ه:'h',و:'w',ی:'y'};

function consonants(name) {
  let key = keyOf(name);
  if (arabic(name)) key = [...key].map(letter => roman[letter] ?? '').join('');
  else key = key.replace(/sh/g, 'š').replace(/kh/g, 'x').replace(/gh/g, 'q').replace(/ch/g, 'č').replace(/zh/g, 'ž');
  return key.replace(/[aeiouywv]/g, '').replace(/(.)\1+/g, '$1');
}

export function artistSearchText(credit) {
  const names = namesIn(credit);
  return [credit, ...names.flatMap(name => aliasByKey.get(keyOf(name)) ?? [])].join(' ');
}

export function indexArtistNames(credits) {
  const signatures = new Map();
  const artistsByKey = new Map();
  for (const name of credits.flatMap(namesIn)) {
    const key = keyOf(name);
    if (key) artistsByKey.set(key, name);
  }
  for (const name of artistsByKey.values()) {
    const signature = consonants(name);
    if (signature.length < 4) continue;
    if (!signatures.has(signature)) signatures.set(signature, []);
    signatures.get(signature).push(name);
  }
  return signatures;
}

export function searchTerms(value, signatures) {
  const query = normalizeSearch(value);
  if (!query) return [];
  const key = keyOf(query);
  const aliases = aliasByKey.get(key);
  if (aliases) return [normalizeSearch(aliases.find(name => keyOf(name) === key)).split(' ')];
  if (!/^[\p{L} ]+$/u.test(query)) return [query.split(' ')];
  const similar = (signatures.get(consonants(query)) ?? []).filter(name => arabic(name) !== arabic(query));
  // Transliteration helps only when exactly one catalog credit matches.
  return similar.length === 1 ? [query.split(' '), normalizeSearch(similar[0]).split(' ')] : [query.split(' ')];
}

export function matchesSearch(text, termGroups) {
  if (!termGroups.length) return true;
  const normalized = normalizeSearch(text);
  return termGroups.some(terms => terms.every(term => normalized.includes(term)));
}
