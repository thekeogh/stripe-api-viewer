export function expansionError(value: string): string | null {
  const path = value.trim();
  if (!path) return null;
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/.test(path))
    return "Enter one dot-separated path, without commas or expand[]=.";
  if (path.split(".").length > 4)
    return "Stripe supports up to four levels, including data.";
  return null;
}

export function normalizeExpansions(values: unknown): string[] {
  if (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== "string")
  )
    throw new Error("Expand options must be a list of paths.");
  const paths = new Set<string>();
  for (const value of values as string[]) {
    const error = expansionError(value);
    if (error) throw new Error(`Invalid expand option: ${error}`);
    if (value.trim()) paths.add(value.trim());
  }
  return [...paths];
}

export function restoreExpansions(
  expand: unknown,
  legacyParameters: unknown,
): string[] {
  if (Array.isArray(expand))
    return expand.filter((value): value is string => typeof value === "string");
  if (typeof legacyParameters !== "string") return [];
  // Migrate only expansions. Removed generic filters must never be sent invisibly.
  return legacyParameters.split("\n").flatMap((line) => {
    const match = /^\s*expand\[(?:\d*)\]\s*=\s*(.*?)\s*$/.exec(line);
    return match?.[1] ? [match[1]] : [];
  });
}
