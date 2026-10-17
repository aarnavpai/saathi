// Pick the TTS language from the script the reply is actually written in;
// the STT hint only disambiguates scripts shared by several languages.

const SCRIPTS: [RegExp, string][] = [
  [/[ঀ-৿]/, "bn-IN"],
  [/[਀-੿]/, "pa-IN"],
  [/[઀-૿]/, "gu-IN"],
  [/[଀-୿]/, "od-IN"],
  [/[஀-௿]/, "ta-IN"],
  [/[ఀ-౿]/, "te-IN"],
  [/[ಀ-೿]/, "kn-IN"],
  [/[ഀ-ൿ]/, "ml-IN"],
];

export function ttsLanguage(text: string, hint?: string | null): string {
  if (/[ऀ-ॿ]/.test(text)) return hint === "mr-IN" ? "mr-IN" : "hi-IN";
  for (const [re, code] of SCRIPTS) if (re.test(text)) return code;
  return "en-IN";
}

export const LANG_NAMES: Record<string, string> = {
  "en-IN": "English",
  "hi-IN": "Hindi",
  "bn-IN": "Bengali",
  "ta-IN": "Tamil",
  "te-IN": "Telugu",
  "kn-IN": "Kannada",
  "ml-IN": "Malayalam",
  "mr-IN": "Marathi",
  "gu-IN": "Gujarati",
  "pa-IN": "Punjabi",
  "od-IN": "Odia",
};
