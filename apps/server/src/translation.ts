const CYRILLIC_PATTERN = /[\u0400-\u04FF]/;
const PROTECTED_TOKEN_PATTERN = /<[^>]+>|\([^()]+:[0-9.]+\)|\[[^\]]+\]|[A-Za-z0-9_-]+\.(?:safetensors|ckpt|pt|bin)|\b(?:cfg|seed|steps|sampler|scheduler|lora|embedding):[^\s,]+/g;

type TranslationResult = {
  output: string;
  translated: boolean;
};

const PROMPT_SUBSTITUTIONS: Array<{ pattern: RegExp; replacement: string }> = [
  {
    pattern: /\bkolobok\b/gi,
    replacement: "small round gingerbread bun character"
  },
  {
    pattern: /колобок/gi,
    replacement: "small round gingerbread bun character"
  },
  {
    pattern: /\bbun\b/gi,
    replacement: "small round gingerbread bun character"
  }
];

function protectTokens(input: string) {
  const replacements = new Map<string, string>();
  let index = 0;

  const protectedText = input.replace(PROTECTED_TOKEN_PATTERN, (match) => {
    const placeholder = `__PROTECTED_${index}__`;
    replacements.set(placeholder, match);
    index += 1;
    return placeholder;
  });

  return { protectedText, replacements };
}

function restoreTokens(input: string, replacements: Map<string, string>) {
  return Array.from(replacements.entries()).reduce((output, [placeholder, original]) => {
    return output.replaceAll(placeholder, original);
  }, input);
}

function applyPromptSubstitutions(input: string) {
  return PROMPT_SUBSTITUTIONS.reduce((output, rule) => {
    return output.replace(rule.pattern, rule.replacement);
  }, input);
}

async function translateViaGoogle(input: string, targetLanguage: string) {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "auto");
  url.searchParams.set("tl", targetLanguage);
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", input);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Translation request failed with status ${response.status}`);
  }

  const payload = await response.json() as Array<any>;
  const translated = Array.isArray(payload[0])
    ? payload[0].map((part: Array<any>) => part[0] ?? "").join("")
    : "";

  return translated.trim();
}

export function containsCyrillic(input: string) {
  return CYRILLIC_PATTERN.test(input);
}

export async function maybeTranslatePrompt(input: string, targetLanguage: string): Promise<TranslationResult> {
  if (!input.trim() || !containsCyrillic(input)) {
    return {
      output: input,
      translated: false
    };
  }

  const { protectedText, replacements } = protectTokens(input);
  const translated = await translateViaGoogle(protectedText, targetLanguage);

  return {
    output: applyPromptSubstitutions(restoreTokens(translated || input, replacements)),
    translated: translated.length > 0
  };
}
