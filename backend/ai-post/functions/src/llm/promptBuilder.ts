import { LlmGenerationInput } from "../types/contracts";

function modeInstructions(mode: LlmGenerationInput["mode"]): string {
  switch (mode) {
    case "BIOGRAPHY":
      return [
        "BIOGRAPHY rules:",
        "- Keep it factual and public-facing.",
        "- No invented dialogue or private thoughts.",
        "- Pick one documented turning point with real stakes.",
        "- Use only broadly documented facts; if unsure, stay generic and lower confidence.",
        "- Make the insight feel earned from the event, not stated as a label."
      ].join("\n");
    case "TRIVIA":
      return [
        "TRIVIA rules:",
        "- Generate one interesting educational fact.",
        "- Make it immediately surprising and clear."
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
    "Cut filler. Each sentence must add new value.",
    `Length target for body: ${input.length === "short" ? "50-110" : "120-220"} words.`,
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
