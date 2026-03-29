import copy from './copy';
import type {
  AIService,
  ApplicationAnalysisInput,
  MemberRecommendationInput
} from './types';

const POSITIVE_KEYWORDS = [
  'Р°РєС‚РёРІ',
  'РѕРЅР»Р°Р№РЅ',
  'РїРѕРјРѕРі',
  'РїРѕРјРѕС‰',
  'РґСЂСѓРі',
  'РєРѕРјР°РЅРґ',
  'РѕС‚РІРµС‚СЃС‚РІ',
  'Р°РґРµРєРІР°С‚',
  'РѕРїС‹С‚',
  'rp',
  'СЂРї'
] as const;

const NEGATIVE_KEYWORDS = [
  'С‚РІРёРЅРє',
  'РѕР±РјР°РЅ',
  'С‚РѕРєСЃ',
  'РѕСЃРєРѕСЂР±',
  'С‡РёС‚',
  'СЃР»РёРІ',
  'СЃРїР°Рј',
  'РєРѕРЅС„Р»РёРєС‚'
] as const;

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

function scoreApplication(application: ApplicationAnalysisInput) {
  const text = normalizeText(application.text).toLowerCase();
  const positiveHits = POSITIVE_KEYWORDS.filter(keyword => text.includes(keyword));
  const negativeHits = NEGATIVE_KEYWORDS.filter(keyword => text.includes(keyword));
  const lengthBonus = Math.min(3, Math.floor(text.length / 120));

  const score = positiveHits.length * 2 + lengthBonus - negativeHits.length * 2;
  return { score, positiveHits, negativeHits };
}

function buildRecommendation(score: number): string {
  if (score >= 6) return 'РџР РРќРЇРўР¬';
  if (score >= 3) return 'Р РђРЎРЎРњРћРўР Р•РўР¬';
  return 'РћРўРљР›РћРќРРўР¬';
}

function buildApplicationAnalysis(application: ApplicationAnalysisInput): string {
  const { score, positiveHits, negativeHits } = scoreApplication(application);
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const risks: string[] = [];

  if (positiveHits.length) {
    strengths.push(`Р•СЃС‚СЊ РїРѕР»РµР·РЅС‹Рµ СЃРёРіРЅР°Р»С‹: ${positiveHits.slice(0, 4).join(', ')}.`);
  }

  if (normalizeText(application.text).length >= 180) {
    strengths.push('Р—Р°СЏРІРєР° РґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РїРѕРґСЂРѕР±РЅР°СЏ Рё РЅРµ РІС‹РіР»СЏРґРёС‚ РїСѓСЃС‚РѕР№.');
  } else {
    weaknesses.push('Р—Р°СЏРІРєР° РєРѕСЂРѕС‚РєР°СЏ, РјРѕС‚РёРІР°С†РёСЏ СЂР°СЃРєСЂС‹С‚Р° СЃР»Р°Р±Рѕ.');
  }

  if (!positiveHits.length) {
    weaknesses.push('РњР°Р»Рѕ РєРѕРЅРєСЂРµС‚РёРєРё РїСЂРѕ РїРѕР»СЊР·Сѓ РґР»СЏ СЃРµРјСЊРё Рё Р°РєС‚РёРІРЅРѕСЃС‚СЊ.');
  }

  if (negativeHits.length) {
    risks.push(`Р•СЃС‚СЊ СЂРёСЃРє РїРѕ С„РѕСЂРјСѓР»РёСЂРѕРІРєР°Рј: ${negativeHits.slice(0, 4).join(', ')}.`);
  }

  if (!risks.length) {
    risks.push('РЇРІРЅС‹С… РєСЂР°СЃРЅС‹С… С„Р»Р°РіРѕРІ РїРѕ С‚РµРєСЃС‚Сѓ РЅРµ РІРёРґРЅРѕ, РЅРѕ РЅСѓР¶РЅР° СЂСѓС‡РЅР°СЏ РїСЂРѕРІРµСЂРєР° РїРѕРІРµРґРµРЅРёСЏ РІ РёРіСЂРµ.');
  }

  if (!strengths.length) {
    strengths.push('Р•СЃС‚СЊ Р±Р°Р·РѕРІР°СЏ РјРѕС‚РёРІР°С†РёСЏ РІСЃС‚СѓРїРёС‚СЊ, РЅРѕ Р±РµР· СЃРёР»СЊРЅС‹С… Р°СЂРіСѓРјРµРЅС‚РѕРІ.');
  }

  if (!weaknesses.length) {
    weaknesses.push('РљСЂРёС‚РёС‡РЅС‹С… СЃР»Р°Р±С‹С… РјРµСЃС‚ РїРѕ С‚РµРєСЃС‚Сѓ РЅРµ РІРёРґРЅРѕ.');
  }

  return [
    '1. РЎРёР»СЊРЅС‹Рµ СЃС‚РѕСЂРѕРЅС‹',
    `- ${strengths.join('\n- ')}`,
    '',
    '2. РЎР»Р°Р±С‹Рµ СЃС‚РѕСЂРѕРЅС‹',
    `- ${weaknesses.join('\n- ')}`,
    '',
    '3. Р РёСЃРє',
    `- ${risks.join('\n- ')}`,
    '',
    `4. Р РµРєРѕРјРµРЅРґР°С†РёСЏ: ${buildRecommendation(score)}`
  ].join('\n');
}

function buildOfflineReply(userPrompt: string): string {
  const prompt = normalizeText(userPrompt);
  const promptLower = prompt.toLowerCase();

  if (!prompt) {
    return copy.ai.emptyPrompt;
  }

  if (promptLower.includes('Р·Р°СЏРІ') && promptLower.includes('СЃРµРј')) {
    return [
      'РљРѕСЂРѕС‚РєРёР№ С€Р°Р±Р»РѕРЅ Р·Р°СЏРІРєРё:',
      '1. РљС‚Рѕ С‚С‹ Рё РєР°РєРѕР№ Сѓ С‚РµР±СЏ РЅРёРє.',
      '2. РЎРєРѕР»СЊРєРѕ С‚РµР±Рµ Р»РµС‚ Рё РєР°РєРѕР№ Сѓ С‚РµР±СЏ РѕРЅР»Р°Р№РЅ.',
      '3. Р§РµРј Р±СѓРґРµС€СЊ РїРѕР»РµР·РµРЅ СЃРµРјСЊРµ.',
      '4. РџРѕС‡РµРјСѓ С…РѕС‡РµС€СЊ РёРјРµРЅРЅРѕ Рє РЅР°Рј.',
      '5. Р§РµРј РѕС‚Р»РёС‡Р°РµС€СЊСЃСЏ РѕС‚ РґСЂСѓРіРёС… РєР°РЅРґРёРґР°С‚РѕРІ.'
    ].join('\n');
  }

  if (promptLower.includes('РїСЂРёРІРµС‚') || promptLower.includes('Р·РґСЂР°РІ')) {
    return 'РџСЂРёРІРµС‚. РЇ РѕС„С„Р»Р°Р№РЅ-РїРѕРјРѕС‰РЅРёРє СЃРµРјСЊРё: РјРѕРіСѓ РїРѕРґСЃРєР°Р·Р°С‚СЊ С‚РµРєСЃС‚, РёРґРµСЋ РѕР±СЉСЏРІР»РµРЅРёСЏ РёР»Рё РєРѕСЂРѕС‚РєРёР№ СЂР°Р·Р±РѕСЂ СЃРёС‚СѓР°С†РёРё.';
  }

  if (promptLower.includes('РѕР±СЉСЏРІ') || promptLower.includes('Р°РЅРѕРЅСЃ')) {
    return [
      'Р§РµСЂРЅРѕРІРёРє РѕР±СЉСЏРІР»РµРЅРёСЏ:',
      'РЎРµРјСЊСЏ РѕС‚РєСЂС‹РІР°РµС‚ РЅР°Р±РѕСЂ Р°РєС‚РёРІРЅС‹С… РёРіСЂРѕРєРѕРІ. РќСѓР¶РЅС‹ Р°РґРµРєРІР°С‚РЅРѕСЃС‚СЊ, РѕРЅР»Р°Р№РЅ Рё РіРѕС‚РѕРІРЅРѕСЃС‚СЊ СЂР°Р±РѕС‚Р°С‚СЊ РІ РєРѕРјР°РЅРґРµ.',
      'Р•СЃР»Рё С…РѕС‡РµС€СЊ РІСЃС‚СѓРїРёС‚СЊ, РїРѕРґР°Р№ Р·Р°СЏРІРєСѓ С‡РµСЂРµР· РїР°РЅРµР»СЊ СЃРµРјСЊРё Рё РєРѕСЂРѕС‚РєРѕ СЂР°СЃСЃРєР°Р¶Рё Рѕ СЃРµР±Рµ.'
    ].join('\n');
  }

  if (promptLower.includes('РєРѕРЅС„Р»РёРєС‚') || promptLower.includes('СЃСЃРѕСЂР°')) {
    return [
      'РЎРїРѕРєРѕР№РЅС‹Р№ РІР°СЂРёР°РЅС‚ РѕС‚РІРµС‚Р°:',
      'Р”Р°РІР°Р№ Р±РµР· СЌРјРѕС†РёР№. РЎРЅР°С‡Р°Р»Р° С„РёРєСЃРёСЂСѓРµРј, С‡С‚Рѕ РёРјРµРЅРЅРѕ РїСЂРѕРёР·РѕС€Р»Рѕ, РїРѕС‚РѕРј СѓР¶Рµ СЂРµС€Р°РµРј РІРѕРїСЂРѕСЃ РїРѕ С„Р°РєС‚Р°Рј.',
      'Р•СЃР»Рё РЅСѓР¶РЅРѕ, РїРѕРґРєР»СЋС‡Р°РµРј СЃС‚Р°СЂС€РёС… Рё Р·Р°РєСЂС‹РІР°РµРј СЃРёС‚СѓР°С†РёСЋ Р±РµР· Р»РёС€РЅРµРіРѕ С€СѓРјР°.'
    ].join('\n');
  }

  return [
    'РћС„С„Р»Р°Р№РЅ-РїРѕРјРѕС‰РЅРёРє СЃРѕРІРµС‚СѓРµС‚:',
    `- РЎС„РѕСЂРјСѓР»РёСЂСѓР№ Р·Р°РїСЂРѕСЃ РєРѕСЂРѕС‡Рµ Рё РїСЂРµРґРјРµС‚РЅРѕ: "${prompt.slice(0, 120)}"`,
    '- Р•СЃР»Рё РЅСѓР¶РµРЅ С‚РµРєСЃС‚, СЃСЂР°Р·Сѓ СѓРєР°Р¶Рё С„РѕСЂРјР°С‚: СЃРѕРѕР±С‰РµРЅРёРµ, РѕР±СЉСЏРІР»РµРЅРёРµ, Р·Р°СЏРІРєР° РёР»Рё РѕС‚РІРµС‚ РёРіСЂРѕРєСѓ.',
    '- Р•СЃР»Рё РЅСѓР¶РµРЅ СЂР°Р·Р±РѕСЂ, РґР°Р№ С„Р°РєС‚С‹: РєС‚Рѕ, С‡С‚Рѕ СЃРґРµР»Р°Р», РєР°РєРѕР№ РЅСѓР¶РµРЅ РёС‚РѕРі.'
  ].join('\n');
}

function hoursFromMinutes(minutes: unknown): number {
  return Math.max(0, Number(minutes) || 0) / 60;
}

function inactiveDaysSince(timestamp: unknown): number {
  const safeTimestamp = Number(timestamp) || 0;
  if (!safeTimestamp) return 999;
  return Math.max(0, (Date.now() - safeTimestamp) / (24 * 60 * 60 * 1000));
}

function buildMemberRecommendation(profile: MemberRecommendationInput): string {
  const points = Math.max(0, Number(profile.points) || 0);
  const warns = Math.max(0, Number(profile.warns) || 0);
  const commends = Math.max(0, Number(profile.commends) || 0);
  const messages = Math.max(0, Number(profile.messageCount) || 0);
  const activityScore = Math.max(0, Number(profile.activityScore) || 0);
  const voiceHours = hoursFromMinutes(profile.voiceMinutes);
  const inactiveDays = inactiveDaysSince(profile.lastSeenAt);
  const currentRoleName = normalizeText(profile.currentRoleName) || 'РќРµС‚ СЂРѕР»Рё';
  const autoTargetRoleName = normalizeText(profile.autoTargetRoleName);

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const risks: string[] = [];

  if (activityScore >= 140) {
    strengths.push(`РѕС‡РµРЅСЊ РІС‹СЃРѕРєР°СЏ РѕР±С‰Р°СЏ Р°РєС‚РёРІРЅРѕСЃС‚СЊ (${activityScore} РѕС‡Рє.)`);
  } else if (activityScore >= 60) {
    strengths.push(`СЃС‚Р°Р±РёР»СЊРЅР°СЏ Р°РєС‚РёРІРЅРѕСЃС‚СЊ (${activityScore} РѕС‡Рє.)`);
  } else {
    weaknesses.push(`Р°РєС‚РёРІРЅРѕСЃС‚СЊ РїРѕРєР° РЅРёР·РєР°СЏ (${activityScore} РѕС‡Рє.)`);
  }

  if (messages >= 60) {
    strengths.push(`РјРЅРѕРіРѕ СЃРѕРѕР±С‰РµРЅРёР№ РІ Discord (${messages})`);
  } else if (messages < 10) {
    weaknesses.push(`РѕС‡РµРЅСЊ РјР°Р»Рѕ СЃРѕРѕР±С‰РµРЅРёР№ (${messages})`);
  }

  if (voiceHours >= 5) {
    strengths.push(`С…РѕСЂРѕС€Р°СЏ РіРѕР»РѕСЃРѕРІР°СЏ РІРѕРІР»РµС‡С‘РЅРЅРѕСЃС‚СЊ (${voiceHours.toFixed(1)} С‡)`);
  } else if (voiceHours < 1) {
    weaknesses.push(`РїРѕС‡С‚Рё РЅРµС‚ РіРѕР»РѕСЃРѕРІРѕР№ Р°РєС‚РёРІРЅРѕСЃС‚Рё (${voiceHours.toFixed(1)} С‡)`);
  }

  if (points >= 70) {
    strengths.push(`СЃРёР»СЊРЅР°СЏ СЂРµРїСѓС‚Р°С†РёСЏ (${points}/100)`);
  } else if (points <= 30) {
    risks.push(`СЃР»Р°Р±Р°СЏ СЂРµРїСѓС‚Р°С†РёСЏ (${points}/100)`);
  }

  if (commends > warns) {
    strengths.push(`РїРѕС…РІР°Р»С‹ РїРµСЂРµРІРµС€РёРІР°СЋС‚ РїСЂРµРґС‹ (${commends} vs ${warns})`);
  }

  if (warns >= 3) {
    risks.push(`РјРЅРѕРіРѕ РґРёСЃС†РёРїР»РёРЅР°СЂРЅС‹С… РѕС‚РјРµС‚РѕРє (${warns})`);
  } else if (warns > 0) {
    weaknesses.push(`РµСЃС‚СЊ РїСЂРµРґС‹ (${warns})`);
  }

  if (inactiveDays >= 7) {
    risks.push(`РґРѕР»РіР°СЏ РЅРµР°РєС‚РёРІРЅРѕСЃС‚СЊ (${inactiveDays.toFixed(1)} РґРЅ.)`);
  } else if (inactiveDays >= 3) {
    weaknesses.push(`РµСЃС‚СЊ AFK-СЂРёСЃРє (${inactiveDays.toFixed(1)} РґРЅ. Р±РµР· Р°РєС‚РёРІРЅРѕСЃС‚Рё)`);
  } else {
    strengths.push(`РЅРµРґР°РІРЅСЏСЏ Р°РєС‚РёРІРЅРѕСЃС‚СЊ (${inactiveDays.toFixed(1)} РґРЅ. РЅР°Р·Р°Рґ)`);
  }

  if (autoTargetRoleName && autoTargetRoleName !== currentRoleName) {
    strengths.push(`РїРѕ Р°РІС‚Рѕ-СЂР°РЅРіСѓ СѓР¶Рµ С‚СЏРЅРµС‚ РЅР° ${autoTargetRoleName}`);
  }

  if (!strengths.length) {
    strengths.push('РєСЂРёС‚РёС‡РЅС‹С… РјРёРЅСѓСЃРѕРІ РїРѕ СЃС‚Р°С‚РёСЃС‚РёРєРµ РЅРµ РЅР°Р№РґРµРЅРѕ');
  }

  if (!weaknesses.length) {
    weaknesses.push('Р·Р°РјРµС‚РЅС‹С… СЃР»Р°Р±С‹С… РјРµСЃС‚ РїРѕ РјРµС‚СЂРёРєР°Рј СЃРµР№С‡Р°СЃ РЅРµС‚');
  }

  if (!risks.length) {
    risks.push('СЏРІРЅС‹С… РєСЂР°СЃРЅС‹С… С„Р»Р°РіРѕРІ РїРѕ С†РёС„СЂР°Рј РЅРµС‚');
  }

  let recommendation = 'РћРЎРўРђР’РРўР¬ Р’ РўР•РљРЈР©Р•Рњ Р РђРќР“Р•';
  let action = 'РЅР°Р±Р»СЋРґР°С‚СЊ РґР°Р»СЊС€Рµ';

  if (inactiveDays >= 7 && messages <= 5 && voiceHours < 1 && points <= 20) {
    recommendation = 'РљРРљ / Р§РРЎРўРљРђ Р—Рђ AFK';
    action = 'РїСЂРѕРІРµСЂРёС‚СЊ РїСЂРёС‡РёРЅСѓ РѕС‚СЃСѓС‚СЃС‚РІРёСЏ Рё РєРёРєРЅСѓС‚СЊ, РµСЃР»Рё РёРіСЂРѕРє РЅРµ РІС‹С…РѕРґРёС‚ РЅР° СЃРІСЏР·СЊ';
  } else if (inactiveDays >= 3) {
    recommendation = 'РџР Р•Р”РЈРџР Р•Р”РРўР¬ РћР‘ AFK';
    action = 'РѕС‚РїСЂР°РІРёС‚СЊ РїСЂРµРґСѓРїСЂРµР¶РґРµРЅРёРµ Рё РґР°С‚СЊ РєРѕСЂРѕС‚РєРёР№ СЃСЂРѕРє РЅР° РІРѕР·РІСЂР°С‚ РІ Р°РєС‚РёРІ';
  } else if (warns >= 3 && points <= 40) {
    recommendation = 'Р”РРЎР¦РРџР›РРќРђР РќРђРЇ РџР РћР’Р•Р РљРђ';
    action = 'РЅРµ РїРѕРІС‹С€Р°С‚СЊ Рё РѕС‚РґРµР»СЊРЅРѕ СЂР°Р·РѕР±СЂР°С‚СЊ РїРѕРІРµРґРµРЅРёРµ СѓС‡Р°СЃС‚РЅРёРєР°';
  } else if (autoTargetRoleName && autoTargetRoleName !== currentRoleName && activityScore >= 50 && points >= 45) {
    recommendation = `Р РђРЎРЎРњРћРўР Р•РўР¬ РџРћР’Р«РЁР•РќРР• Р”Рћ ${autoTargetRoleName.toUpperCase()}`;
    action = `РїСЂРѕРІРµСЂРёС‚СЊ РєР°С‡РµСЃС‚РІРѕ Р°РєС‚РёРІРЅРѕСЃС‚Рё Рё РїСЂРё Р¶РµР»Р°РЅРёРё РїРѕРІС‹СЃРёС‚СЊ СЃ ${currentRoleName} РґРѕ ${autoTargetRoleName}`;
  } else if (points >= 75 && commends >= warns + 2 && (messages >= 25 || voiceHours >= 3)) {
    recommendation = 'РџРћРћР©Р РРўР¬ / РћРўРњР•РўРРўР¬';
    action = 'РјРѕР¶РЅРѕ РІС‹РґР°С‚СЊ РїРѕС…РІР°Р»Сѓ РёР»Рё РѕС‚РјРµС‚РёС‚СЊ СѓС‡Р°СЃС‚РЅРёРєР° РІ СЃРµРјСЊРµ';
  }

  const summary = [
    `РЈС‡Р°СЃС‚РЅРёРє: ${normalizeText(profile.displayName) || 'Р‘РµР· РёРјРµРЅРё'}`,
    `РўРµРєСѓС‰РёР№ СЂР°РЅРі: ${currentRoleName}`,
    `РћС‡РєРё Р°РєС‚РёРІРЅРѕСЃС‚Рё: ${activityScore}`,
    `Р РµРїСѓС‚Р°С†РёСЏ: ${points}/100`,
    `РЎРѕРѕР±С‰РµРЅРёСЏ: ${messages}`,
    `Р“РѕР»РѕСЃ: ${voiceHours.toFixed(1)} С‡`,
    `РџРѕС…РІР°Р»С‹ / РїСЂРµРґС‹: ${commends} / ${warns}`,
    `Р¦РµР»СЊ Р°РІС‚Рѕ-СЂР°РЅРіР°: ${autoTargetRoleName || 'СЃРѕРІРїР°РґР°РµС‚ СЃ С‚РµРєСѓС‰РёРј РёР»Рё РЅРµРґРѕСЃС‚СѓРїРЅР°'}`
  ];

  return [
    '1. РЎРІРѕРґРєР°',
    `- ${summary.join('\n- ')}`,
    '',
    '2. РЎРёР»СЊРЅС‹Рµ СЃС‚РѕСЂРѕРЅС‹',
    `- ${strengths.join('\n- ')}`,
    '',
    '3. РЎР»Р°Р±С‹Рµ РјРµСЃС‚Р° Рё СЂРёСЃРєРё',
    `- ${[...weaknesses, ...risks].join('\n- ')}`,
    '',
    `4. Р РµРєРѕРјРµРЅРґР°С†РёСЏ: ${recommendation}`,
    `- РЎР»РµРґСѓСЋС‰РµРµ РґРµР№СЃС‚РІРёРµ: ${action}`
  ].join('\n');
}

export function createAIService({ enabled }: { enabled: boolean }): AIService {
  async function aiText(_systemPrompt: string, userPrompt: string): Promise<string> {
    if (!enabled) {
      throw new Error(copy.ai.disabled);
    }

    return buildOfflineReply(userPrompt);
  }

  async function analyzeApplication(application: ApplicationAnalysisInput): Promise<string> {
    if (!enabled) {
      throw new Error(copy.ai.disabled);
    }

    return buildApplicationAnalysis(application);
  }

  async function analyzeMember(profile: MemberRecommendationInput): Promise<string> {
    if (!enabled) {
      throw new Error(copy.ai.disabled);
    }

    return buildMemberRecommendation(profile);
  }

  return {
    aiText,
    analyzeApplication,
    analyzeMember
  };
}

export default createAIService;
