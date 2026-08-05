// Pure logo-visibility decision (tested without a component framework):
// broken logo_url must fall back to the IconTile, reactively.
export function logoVisible(src: string | undefined, failed: boolean): boolean {
  return !!src && !failed;
}
