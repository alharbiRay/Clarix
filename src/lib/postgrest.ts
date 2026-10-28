/**
 * A PostgREST `or=(…)` filter matching `q` anywhere in any of `columns`
 * (case-insensitive), safe for any user input.
 *
 * Raw interpolation lets commas, parentheses and dots in the search box add
 * or change filter conditions. Here the value is double-quoted (PostgREST's
 * escape for reserved characters, with `\` and `"` backslash-escaped), and
 * LIKE wildcards in the input are escaped so "100%" searches for "100%".
 * Input is capped at 100 characters.
 */
export function ilikeAnyFilter(columns: string[], q: string): string {
  // LIKE level: a literal backslash, % or _ in the search text.
  const like = q
    .slice(0, 100)
    .replace(/\\/g, "\\\\")
    .replace(/[%_]/g, (c) => `\\${c}`);
  // PostgREST level: inside double quotes, escape \ and ".
  const quoted = `"%${like.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}%"`;
  return columns.map((c) => `${c}.ilike.${quoted}`).join(",");
}
