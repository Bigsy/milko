import type { ProofingDialect } from "./types";

export type ResolvedDialect = Exclude<ProofingDialect, "AUTO">;

export function resolveDialect(dialect: ProofingDialect, language = navigator.language): ResolvedDialect {
  if (dialect !== "AUTO") return dialect;
  const region = language.split(/[-_]/)[1]?.toUpperCase();
  if (region === "GB") return "BRITISH";
  if (region === "AU") return "AUSTRALIAN";
  if (region === "CA") return "CANADIAN";
  if (region === "IN") return "INDIAN";
  return "AMERICAN";
}
