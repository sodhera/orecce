import { LlmGenerationInput } from "../types/contracts";

function modeInstructions(mode: LlmGenerationInput["mode"]): string {
  switch (mode) {
    case "BIOGRAPHY":
      return [
        "BIOGRAPHY rules:",
        "- Keep it factual and public-facing.",
        "- No invented dialogue or private thoughts.",
        "- Each sentence must add new value.",
        "- Include a date or number when possible.",
        "- Prefer short declarative sentences over ornate style.",
        "- Sentence 2-3 should introduce tension or obstacle.",
        "- Use only broadly documented facts; if unsure, reduce confidence tone instead of inventing details.",
        "- Avoid broad praise language.",
        "- End with concrete consequence, not a moral label."
      ].join("\n");
    case "TRIVIA":
      return [
        "TRIVIA rules:",
        "- Generate one educational fact.",
        "- Body must be exactly 1 or 2 sentences (about 18-42 words total).",
        "- Sentence 1 should be surprising; sentence 2 should explain why it happens.",
        "- Include at least one concrete number or named detail.",
        "- Avoid hype words and hedging.",
        "- Keep wording compact; no long setup."
      ].join("\n");
    case "NICHE":
      return [
        "NICHE rules:",
        "- Content can be vibe-driven and subjective.",
        "- Keep it specific, catchy, and highly shareable."
      ].join("\n");
  }
}

export function buildSystemPrompt(input: LlmGenerationInput): string {
  const bodyLengthTarget =
    input.mode === "TRIVIA"
      ? "1-2 sentences, about 18-42 words total."
      : input.length === "short"
        ? "50-110 words."
        : "120-220 words.";

  const preferenceBlock =
    input.mode === "BIOGRAPHY" && input.preferences.biographyInstructions
      ? `User biography preference:\n${input.preferences.biographyInstructions.trim()}`
      : input.mode === "NICHE" && input.preferences.nicheInstructions
        ? `User niche preference:\n${input.preferences.nicheInstructions.trim()}`
        : "";

  const doNotRepeatBlock = input.recentTitles.length
    ? `Do not repeat or closely paraphrase these recent titles:\n- ${input.recentTitles.join("\n- ")}`
    : "No recent titles exist yet.";

  const correctionBlock = input.correctiveInstruction
    ? `Previous attempt failed validation. Fix these issues exactly:\n${input.correctiveInstruction}`
    : "";

  return [
    "Return one JSON object only with keys: title, body, post_type, tags, confidence, uncertainty_note.",
    "No markdown, no backticks, no extra keys.",
    "Title must be click-stopping, specific, and non-misleading.",
    "Write for a general audience with short, clear sentences.",
    "Story flow: hook -> tension -> turn -> payoff.",
    "Open with surprise, keep suspense, end with an earned insight (unlabeled).",
    "Each new post must use a new angle, new event, or new lesson from the same profile.",
    "If a draft overlaps recent posts, rewrite it with a different core event.",
    "Cut filler. Each sentence must add new value.",
    `Length target for body: ${bodyLengthTarget}`,
    modeInstructions(input.mode),
    doNotRepeatBlock,
    preferenceBlock,
    correctionBlock
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildUserPrompt(input: LlmGenerationInput): string {
  return [
    `Mode: ${input.mode}`,
    `Profile: ${input.profile}`,
    `Length: ${input.length}`,
    "Create the next distinct post for this feed."
  ].join("\n");
}
