/**
 * Universal text normalizer optimized for games (RPG, HUDs, stylized nicknames,
 * Minecraft/Unity/HTML color tags, numbers, percentages, fractions, symbols, emojis)
 * and Brazilian Portuguese speech synthesis.
 */

const UNITS = [
  'zero',
  'um',
  'dois',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
  'dez',
  'onze',
  'doze',
  'treze',
  'quatorze',
  'quinze',
  'dezesseis',
  'dezessete',
  'dezoito',
  'dezenove',
];

const TENS = [
  '',
  '',
  'vinte',
  'trinta',
  'quarenta',
  'cinquenta',
  'sessenta',
  'setenta',
  'oitenta',
  'noventa',
];

const HUNDREDS = [
  '',
  'cento',
  'duzentos',
  'trezentos',
  'quatrocentos',
  'quinhentos',
  'seiscentos',
  'setecentos',
  'oitocentos',
  'novecentos',
];

function threeDigitsToPt(n: number): string {
  if (n === 0) return 'zero';
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const rem = n % 100;
  const parts: string[] = [];
  if (c > 0) parts.push(HUNDREDS[c]);
  if (rem > 0) {
    if (rem < 20) {
      parts.push(UNITS[rem]);
    } else {
      const d = Math.floor(rem / 10);
      const u = rem % 10;
      parts.push(u > 0 ? `${TENS[d]} e ${UNITS[u]}` : TENS[d]);
    }
  }
  return parts.join(' e ');
}

export function integerToPtWords(num: number): string {
  if (!Number.isFinite(num)) return '';
  if (num < 0) return `menos ${integerToPtWords(Math.abs(num))}`;
  const n = Math.floor(num);
  if (n === 0) return 'zero';
  if (n > 999_999_999) {
    return String(n).split('').map((d) => UNITS[Number(d)] || d).join(' ');
  }

  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;

  const parts: string[] = [];
  if (millions > 0) {
    parts.push(
      millions === 1 ? 'um milhão' : `${threeDigitsToPt(millions)} milhões`
    );
  }
  if (thousands > 0) {
    parts.push(thousands === 1 ? 'mil' : `${threeDigitsToPt(thousands)} mil`);
  }
  if (rest > 0) {
    if (parts.length > 0 && (rest < 100 || rest % 100 === 0)) {
      parts.push(`e ${threeDigitsToPt(rest)}`);
    } else {
      parts.push(threeDigitsToPt(rest));
    }
  }
  return parts.join(' ');
}

const SMALL_CAPS_MAP: Record<string, string> = {
  ᴀ: 'a', ʙ: 'b', ᴄ: 'c', ᴅ: 'd', ᴇ: 'e', ꜰ: 'f', ɢ: 'g', ʜ: 'h', ɪ: 'i',
  ᴊ: 'j', ᴋ: 'k', ʟ: 'l', ᴍ: 'm', ɴ: 'n', ᴏ: 'o', ᴘ: 'p', ǫ: 'q', ʀ: 'r',
  ꜱ: 's', ᴛ: 't', ᴜ: 'u', ᴠ: 'v', ᴡ: 'w', ʏ: 'y', ᴢ: 'z',
  '@': ' arroba ',
};

const GAME_ACRONYMS: Record<string, string> = {
  HP: 'agá pê',
  MP: 'ême pê',
  XP: 'xis pê',
  FPS: 'éfe pê ésse',
  NPC: 'êne pê cê',
  PVP: 'pê vê pê',
  PVE: 'pê vê é',
  RPG: 'érre pê gê',
  HUD: 'râdi',
  AFK: 'á éfe ká',
  GG: 'gê gê',
  DPS: 'dê pê ésse',
  CRIT: 'crítico',
  DMG: 'dano',
  ATK: 'ataque',
  DEF: 'defesa',
  SPD: 'velocidade',
  STR: 'força',
  INT: 'inteligência',
  AGI: 'agilidade',
  STA: 'vigor',
  LVL: 'nível',
  LV: 'nível',
  KD: 'ká dê',
  KDA: 'ká dê á',
  MVP: 'ême vê pê',
  OP: 'ó pê',
  GGWP: 'gê gê dâblio pê',
};

const ROMAN_MAP: Record<string, string> = {
  I: 'um',
  II: 'dois',
  III: 'três',
  IV: 'quatro',
  V: 'cinco',
  VI: 'seis',
  VII: 'sete',
  VIII: 'oito',
  IX: 'nove',
  X: 'dez',
  XI: 'onze',
  XII: 'doze',
};

function normalizeSegmentForSpeech(segment: string): string {
  let s = segment;

  // 1. Decode stylized Unicode fonts (math bold/fraktur/monospace/fullwidth/circled) while keeping Portuguese accents
  s = s.normalize('NFKD').normalize('NFC');
  s = s.replace(/[ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡʏᴢ]/g, (ch) => SMALL_CAPS_MAP[ch] || ch);

  // 2. Strip game color & formatting codes (Minecraft §a, &c, Unity <color=...>, BBCode [color=...], HTML tags)
  s = s
    .replace(/§[0-9a-fk-orx]/gi, '')
    .replace(/(^|\s)&[0-9a-fklmnor](?=\S)/gi, '$1')
    .replace(/\[#?[0-9a-f]{6,8}\]/gi, '')
    .replace(/<\/?(?:color|b|i|u|s|size|material|quad|sprite|br|p|span|div|strong|em)(?:=[^>\]]*)?>/gi, ' ')
    .replace(/\[\/?(?:color|b|i|u|s|size|center|left|right)(?:=[^\]]*)?\]/gi, ' ');

  // 3. Clean placeholder braces like {player} or %player% -> player
  s = s.replace(/\{([a-zA-Z0-9_ ]+)\}/g, ' $1 ').replace(/%([a-zA-Z0-9_]+)%/g, ' $1 ');

  // 4. Separate CamelCase & underscores common in game identifiers/nicknames (UltraCombo -> Ultra Combo)
  s = s
    .replace(/_/g, ' ')
    .replace(/([a-záéíóúâêôãõç])([A-ZÁÉÍÓÚÂÊÔÃÕÇ])/g, '$1 $2');

  // 5. Remove unpronounceable emojis / pictographs cleanly using full Unicode /gu matching
  s = s
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, ' ')
    .replace(/[═─━▬\*•·►▶◀◄❖★☆]+/gu, ' ')
    .replace(/[~^`|\\]{2,}/g, ', ')
    .replace(/[-]{2,}/g, ', ')
    .replace(/[=]{2,}/g, ', ');

  // 7. Currencies & versions & units
  s = s
    .replace(/R\$\s*(\d{1,6})[,.](\d{1,2})/gi, (_, r, c) => {
      const reais = integerToPtWords(Number(r));
      const cents = Number(c);
      return cents > 0
        ? `${reais} reais e ${integerToPtWords(cents)} centavos`
        : `${reais} reais`;
    })
    .replace(/R\$\s*(\d{1,6})/gi, (_, r) => `${integerToPtWords(Number(r))} reais`)
    .replace(/\$\s*(\d{1,6})/g, (_, d) => `${integerToPtWords(Number(d))} dólares`)
    .replace(/\bv(\d+)\.(\d+)(?:\.(\d+))?\b/gi, (_, a, b, c) =>
      c !== undefined
        ? `versão ${integerToPtWords(Number(a))} ponto ${integerToPtWords(Number(b))} ponto ${integerToPtWords(Number(c))}`
        : `versão ${integerToPtWords(Number(a))} ponto ${integerToPtWords(Number(b))}`
    );

  // 8. Roman numerals after Portuguese game terms (Nível IV, Fase III, Ato II, Capítulo X)
  s = s.replace(
    /\b(nível|nivel|fase|ato|capítulo|capitulo|temporada|mundo|parte|grau|tier|rank)\s+(XII|XI|IX|VIII|VII|VI|IV|III|II|I|V|X)\b/gi,
    (_, label, rom) => `${label} ${ROMAN_MAP[rom.toUpperCase()] || rom}`
  );

  // 9. Game acronyms (exact uppercase or known game tokens)
  s = s.replace(/\b(HP|MP|XP|FPS|NPC|PVP|PVE|RPG|HUD|AFK|GGWP|GG|DPS|CRIT|DMG|ATK|DEF|SPD|STR|INT|AGI|STA|LVL|LV|KDA|KD|MVP|OP)\b/gi, (m) => {
    return GAME_ACRONYMS[m.toUpperCase()] || m;
  });

  // 10. Fractions / stats like 120/250 -> cento e vinte de duzentos e cinquenta
  s = s.replace(/(\d+)\s*\/\s*(\d+)/g, (_, a, b) => {
    return `${integerToPtWords(Number(a))} de ${integerToPtWords(Number(b))}`;
  });

  // 11. Multipliers like x2, 2x, 1.5x, 2,5x
  s = s
    .replace(/\bx(\d+)\b/gi, (_, n) => `vezes ${integerToPtWords(Number(n))}`)
    .replace(/\b(\d+)[,.](\d+)x\b/gi, (_, a, b) => `${integerToPtWords(Number(a))} vírgula ${integerToPtWords(Number(b))} vezes`)
    .replace(/\b(\d+)x\b/gi, (_, n) => `${integerToPtWords(Number(n))} vezes`);

  // 12. Percentages, signs, math & units
  s = s
    .replace(/(\d+)[,.](\d+)\s*%/g, (_, a, b) => `${integerToPtWords(Number(a))} vírgula ${integerToPtWords(Number(b))} por cento`)
    .replace(/(\d+)\s*%/g, (_, a) => `${integerToPtWords(Number(a))} por cento`)
    .replace(/(\d+)\s*ms\b/gi, (_, n) => `${integerToPtWords(Number(n))} milissegundos`)
    .replace(/(\d+)\s*km\b/gi, (_, n) => `${integerToPtWords(Number(n))} quilômetros`)
    .replace(/(\d+)\s*pts\b/gi, (_, n) => `${integerToPtWords(Number(n))} pontos`)
    .replace(/([0-9])[°º]/g, '$1º')
    .replace(/#(\d+)/g, (_, n) => `número ${integerToPtWords(Number(n))}`)
    .replace(/(^|\s)\+(\d+)/g, (_, sp, n) => `${sp}mais ${integerToPtWords(Number(n))}`)
    .replace(/(^|\s)-(\d+)/g, (_, sp, n) => `${sp}menos ${integerToPtWords(Number(n))}`);

  // 13. Thousands separated by dot (1.500 -> 1500) and decimals (3,14 or 3.14)
  s = s
    .replace(/\b(\d{1,3})\.(\d{3})\b/g, (_, a, b) => integerToPtWords(Number(`${a}${b}`)))
    .replace(/\b(\d+)[,.](\d+)\b/g, (_, a, b) => `${integerToPtWords(Number(a))} vírgula ${integerToPtWords(Number(b))}`)
    .replace(/\b\d+\b/g, (numStr) => integerToPtWords(Number(numStr)));

  // 14. Remaining symbols
  s = s
    .replace(/\s*&\s*/g, ' e ')
    .replace(/\s*\+\s*/g, ' mais ')
    .replace(/\s*=\s*/g, ' igual a ')
    .replace(/->|→/g, ' para ')
    .replace(/@/g, ' arroba ')
    .replace(/[\/\\]/g, ' ')
    .replace(/[_#*~^`]/g, ' ');

  // 15. Collapse stretched gaming/chat letters (booooss -> booss, aaaaaa -> aaa)
  s = s.replace(/([a-zA-ZáéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ])\1{2,}/g, '$1$1');

  // 16. Clean whitespace and newlines
  s = s
    .replace(/\r?\n+/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .replace(/([.!?])\s*\./g, '$1')
    .trim();

  return s;
}

/**
 * Normalizes any text (game UIs, RPG dialogues, HUDs, stylized Unicode, stats, symbols)
 * into clean speakable Brazilian Portuguese while preserving [pausa Xms] markers.
 */
export function normalizeAnyTextForSpeech(text: string): string {
  if (!text) return '';
  const pauseRegex = /(\[pausa\s+\d+\s*ms\])/gi;
  const parts = text.split(pauseRegex);

  return parts
    .map((part) => {
      if (/^\[pausa\s+\d+\s*ms\]$/i.test(part)) {
        return part;
      }
      return normalizeSegmentForSpeech(part);
    })
    .filter(Boolean)
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
