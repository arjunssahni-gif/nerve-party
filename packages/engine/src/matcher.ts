export { normalize, normalizeToken, GENERIC_WORDS, type NormalizedTerm } from './matcher/normalize';
export { osaDistance, tokenTolerance } from './matcher/distance';
export { buildMatchIndex, BUILTIN_VOCABULARY, type MatchIndex, type TermEntry } from './matcher/termIndex';
export { matchAnswer, termCost, type MatchContext, type MatchResult, type MatchStatus } from './matcher/match';
export { splitParts } from './matcher/parts';
