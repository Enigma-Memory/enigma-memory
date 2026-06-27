import { createHash, randomUUID } from "node:crypto";

// Default auto-save policy for Enigma Cortex v3.
// The policy is deterministic, auditable, and fail-closed for sensitive categories.
export const DEFAULT_POLICY = {
  version: "v3.0.0",
  // Minimum salience score required before any auto-save is considered.
  salienceThreshold: 0.45,
  // Category policy: how each detected category is handled by default.
  categoryPolicy: {
    calendar: "auto",
    fact: "auto",
    preference: "auto",
    task: "auto",
    contact: "auto",
    medical: "block",
    credentials: "block",
    legal: "quarantine",
    financial: "quarantine",
    unknown: "quarantine",
  },
  // Categories that can be overridden by an explicit user tag.
  overrideableByTag: ["medical", "credentials", "legal", "financial"],
  // Tags that signal explicit consent to save an otherwise-blocked memory.
  consentTags: ["safe_to_save", "explicit_consent", "medical_consent"],
  // Immunology sentinel configuration.
  immunology: {
    blockPromptInjection: true,
    blockToxicity: true,
    blockContradictionCheckFail: false, // future: compare against existing memories
    maxLength: 8192,
  },
  // Budget / rate limits (enforced in addition to on-chain Session caps).
  maxSavesPerTurn: 8,
  embedding: {
    enabled: true,
  },
};

// Simple keyword maps for deterministic category classification.
const CATEGORY_KEYWORDS = {
  calendar: [
    "meeting",
    "appointment",
    "flight",
    "trip",
    "travel",
    "conference",
    "dinner",
    "lunch",
    "breakfast",
    "event",
    "schedule",
    "calendar",
    "zoom",
    "call with",
    "visit",
    "flight to",
    "flying to",
    "going to",
    "at ",
    "on ",
    "tomorrow",
    "next week",
    "next month",
    "on monday",
    "on tuesday",
    "on wednesday",
    "on thursday",
    "on friday",
    "on saturday",
    "on sunday",
  ],
  task: [
    "todo",
    "to do",
    "to-do",
    "task",
    "remind me",
    "remember to",
    "need to",
    "have to",
    "must",
    "should",
    "buy",
    "pick up",
    "drop off",
    "call ",
    "email ",
    "send ",
    "finish",
    "complete",
    "deadline",
    "due ",
    "by friday",
    "by monday",
  ],
  preference: [
    "like",
    "love",
    "prefer",
    "favorite",
    "favourite",
    "hate",
    "dislike",
    "enjoy",
    "want",
    "would like",
    "into ",
    "not a fan",
    "allergic to",
    "vegan",
    "vegetarian",
    "gluten-free",
    "keto",
    "paleo",
  ],
  contact: [
    "my mom",
    "my dad",
    "my wife",
    "my husband",
    "my partner",
    "my friend",
    "my boss",
    "my colleague",
    "my doctor",
    "my lawyer",
    "called ",
    "phone number",
    "email address",
    "works at",
    "lives in",
    "lives at",
    "contact",
  ],
  medical: [
    "diagnosis",
    "symptom",
    "medication",
    "prescription",
    "doctor said",
    "blood pressure",
    "cholesterol",
    "allergy",
    "condition",
    "disease",
    "treatment",
    "therapy",
    "mental health",
    "anxiety",
    "depression",
    "insulin",
    "vaccine",
    "hospital",
    "surgery",
  ],
  credentials: [
    "password",
    "passcode",
    "secret",
    "api key",
    "private key",
    "seed phrase",
    "mnemonic",
    "token",
    "credential",
    "login",
    "pin ",
    "ssn",
    "social security",
    "credit card",
    "cvv",
    "expiration date",
    "bank account",
    "routing number",
  ],
  legal: [
    "contract",
    "agreement",
    "nda",
    "non-disclosure",
    "lawsuit",
    "attorney",
    "court",
    "legal",
    "terms of service",
    "privacy policy",
    "will ",
    "trust",
    "patent",
    "copyright",
  ],
  financial: [
    "salary",
    "income",
    "investment",
    "stock",
    "crypto",
    "bitcoin",
    "ethereum",
    "solana",
    "mortgage",
    "loan",
    "debt",
    "net worth",
    "portfolio",
    "dividend",
    "tax",
    "irs",
  ],
};

// Patterns that indicate prompt-injection or jailbreak attempts.
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+|previous\s+|the\s+)?instructions?/i,
  /disregard\s+(?:all\s+|previous\s+|the\s+)?instructions?/i,
  /ignore\s+(?:all\s+|previous\s+|the\s+)?prompts?/i,
  /system\s+prompt/i,
  /you\s+are\s+now\s+/i,
  /DAN\b/i,
  /jailbreak/i,
  /\bmode\s*:\s*developer\b/i,
  /\{\{\s*.*system\s*.*\}\}/i,
  /<\s*system\s*>/i,
];

// Lightweight toxicity / unsafe-content heuristics.
const TOXICITY_PATTERNS = [
  /\b(hate\s+(?:you|u)|kill\s+(?:you|u|myself|himself|herself)|die\s+(?:you|u))\b/i,
  /\b(bomb\s+making|how\s+to\s+make\s+a\s+bomb|child\s+abuse|self\s+harm)\b/i,
];

function normalizeText(text) {
  if (text === null || text === undefined) return "";
  return String(text).replace(/\s+/g, " ").trim();
}

function countMatches(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.reduce((count, kw) => {
    const pattern = new RegExp(
      `\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i"
    );
    return count + (pattern.test(lower) ? 1 : 0);
  }, 0);
}

const CATEGORY_PRIORITY = ["credentials", "medical", "legal", "financial"];

function classifyCategory(text, tags = []) {
  const lower = text.toLowerCase();

  // Sensitive categories win on any match to avoid misclassifying them as safe categories.
  for (const category of CATEGORY_PRIORITY) {
    if (countMatches(lower, CATEGORY_KEYWORDS[category]) > 0) {
      return category;
    }
  }

  let best = { category: "unknown", score: 0 };
  const entries = Object.entries(CATEGORY_KEYWORDS);
  for (const [category, keywords] of entries) {
    if (CATEGORY_PRIORITY.includes(category)) continue;
    const score = countMatches(lower, keywords);
    if (score > best.score) {
      best = { category, score };
    }
  }
  return best.category;
}

function scoreSalience(candidate) {
  const text = normalizeText(candidate.text);
  if (text.length < 4) return 0;

  let score = 0.2;
  const lower = text.toLowerCase();

  // Personal relevance signals.
  if (/\b(i|my|me|mine|myself)\b/i.test(text)) score += 0.25;
  if (/\b(we|our|us)\b/i.test(text)) score += 0.15;

  // Temporal specificity signals (calendar/tasks are high-salience).
  if (
    /(tomorrow|tonight|today|next week|next month|on monday|on tuesday|on wednesday|on thursday|on friday|on saturday|on sunday|at \+?\d|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(
      text
    )
  ) {
    score += 0.2;
  }

  // Named-entity / proper-noun signals.
  if (/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/.test(text)) score += 0.15;

  // Action / commitment signals.
  if (
    /\b(meeting|flight|trip|call|appointment|deadline|remind|buy|pick up|need to|have to|must)\b/i.test(
      text
    )
  ) {
    score += 0.15;
  }

  // Negation / uncertainty reduces salience.
  if (
    /\b(maybe|perhaps|possibly|i think|not sure|unsure|don\'t know|might|could be)\b/i.test(
      lower
    )
  ) {
    score -= 0.15;
  }

  // Vague / generic reduces salience.
  if (text.length < 20) score -= 0.1;

  return Math.max(0, Math.min(1, Number(score.toFixed(4))));
}

function hasPromptInjection(text) {
  return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

function hasToxicity(text) {
  return TOXICITY_PATTERNS.some((pattern) => pattern.test(text));
}

function runImmunology(candidate, policy) {
  const text = normalizeText(candidate.text);
  const flags = [];

  if (text.length > policy.immunology.maxLength) {
    flags.push({
      type: "length",
      message: `Text exceeds ${policy.immunology.maxLength} characters`,
    });
  }
  if (policy.immunology.blockPromptInjection && hasPromptInjection(text)) {
    flags.push({
      type: "prompt-injection",
      message: "Prompt-injection pattern detected",
    });
  }
  if (policy.immunology.blockToxicity && hasToxicity(text)) {
    flags.push({
      type: "toxicity",
      message: "Unsafe content pattern detected",
    });
  }

  return {
    passed: flags.length === 0,
    flags,
  };
}

function hasConsentTag(candidate, policy) {
  const tags = Array.isArray(candidate.tags) ? candidate.tags : [];
  return policy.consentTags.some((tag) => tags.includes(tag));
}

function applyCategoryPolicy(candidate, policy) {
  const category = candidate.category || "unknown";
  let action = policy.categoryPolicy[category] || policy.categoryPolicy.unknown;
  const reason = `category=${category}`;

  if (
    action === "block" &&
    policy.overrideableByTag.includes(category) &&
    hasConsentTag(candidate, policy)
  ) {
    action = "auto";
  }

  if (action === "block") {
    return { action: "block", reason: `${reason}; sensitive category blocked` };
  }
  if (action === "quarantine" && !hasConsentTag(candidate, policy)) {
    return {
      action: "quarantine",
      reason: `${reason}; requires review or explicit consent tag`,
    };
  }
  return { action: "auto", reason };
}

function makeMemoryKey(candidate) {
  const id = candidate.id || randomUUID();
  return `memory:${candidate.owner}:${id}`;
}

function makeCandidateId(text, owner) {
  return createHash("sha256")
    .update(`${owner}:${text}`)
    .digest("hex")
    .slice(0, 24);
}

export function extractFacts(turnText) {
  const text = normalizeText(turnText);
  if (text.length === 0) return [];

  // Split turn into candidate statements using sentence boundaries.
  // Preserve quoted text and list items as atomic facts.
  const sentences = text
    .replace(/([.!?])\s+(?=[A-Z])/g, "$1\n")
    .replace(/([.!?])"\s+/g, '$1"\n')
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const facts = [];
  for (const sentence of sentences) {
    // Skip questions, commands to the assistant, and meta text.
    if (
      /^(can you|could you|please|tell me|what|how|why|when|where|who|is |are |do |does |did )/i.test(
        sentence
      )
    ) {
      continue;
    }
    facts.push({ text: sentence });
  }

  return facts;
}

export function createAutoSaveEngine(options = {}) {
  const policy = { ...DEFAULT_POLICY, ...(options.policy || {}) };
  const store = options.store;
  const embedder = options.embedder;

  if (!store || typeof store.put !== "function") {
    throw new TypeError("Auto-save engine requires a store with put()");
  }

  async function addMemory(candidate) {
    const key = makeMemoryKey(candidate);
    const memory = {
      id: candidate.id,
      text: candidate.text,
      owner: candidate.owner,
      category: candidate.category,
      salience: candidate.salience,
      tags: candidate.tags || [],
      policyVersion: policy.version,
      savedAt: Date.now(),
    };
    store.put(key, memory);

    if (policy.embedding.enabled && embedder) {
      try {
        const vector = await embedder(candidate.text);
        store.putEmbedding(key, vector);
      } catch (err) {
        // Embedding failure is non-fatal; memory is still persisted.
        console.error("Auto-save embedding failed:", err.message);
      }
    }

    return { ok: true, key, memory };
  }

  function evaluate(candidate) {
    const classified = {
      ...candidate,
      category: classifyCategory(candidate.text, candidate.tags),
      salience: scoreSalience(candidate),
    };

    const immunology = runImmunology(classified, policy);
    if (!immunology.passed) {
      return {
        action: "block",
        reason: `immunology: ${immunology.flags.map((f) => f.type).join(", ")}`,
        flags: immunology.flags,
        candidate: classified,
      };
    }

    const categoryDecision = applyCategoryPolicy(classified, policy);
    if (categoryDecision.action !== "auto") {
      return { ...categoryDecision, candidate: classified };
    }

    if (classified.salience < policy.salienceThreshold) {
      return {
        action: "quarantine",
        reason: `salience ${classified.salience} below threshold ${policy.salienceThreshold}`,
        candidate: classified,
      };
    }

    return {
      action: "auto",
      reason: categoryDecision.reason,
      candidate: classified,
    };
  }

  async function processTurn(turn) {
    const owner = turn.owner;
    const tags = Array.isArray(turn.tags) ? turn.tags : [];
    if (!owner || typeof owner !== "string") {
      throw new TypeError("turn.owner is required");
    }

    const rawFacts = extractFacts(turn.text);
    const candidates = rawFacts
      .slice(0, policy.maxSavesPerTurn)
      .map((fact) => ({
        id: makeCandidateId(fact.text, owner),
        owner,
        text: fact.text,
        tags,
        sourceTurnId: turn.turnId || null,
      }));

    const saved = [];
    const quarantined = [];
    const blocked = [];

    for (const candidate of candidates) {
      const decision = evaluate(candidate);
      const item = {
        id: decision.candidate.id,
        text: decision.candidate.text,
        category: decision.candidate.category,
        salience: decision.candidate.salience,
        action: decision.action,
        reason: decision.reason,
      };

      if (decision.action === "auto") {
        try {
          const result = await addMemory(decision.candidate);
          saved.push({ ...item, key: result.key });
        } catch (err) {
          blocked.push({
            ...item,
            action: "block",
            reason: `storage error: ${err.message}`,
          });
        }
      } else if (decision.action === "quarantine") {
        quarantined.push(item);
      } else {
        blocked.push(item);
      }
    }

    return {
      owner,
      processedAt: Date.now(),
      saved,
      quarantined,
      blocked,
      policyVersion: policy.version,
    };
  }

  return {
    policy,
    extractFacts,
    classifyCategory,
    scoreSalience,
    runImmunology,
    evaluate,
    addMemory,
    processTurn,
  };
}

export default createAutoSaveEngine;
