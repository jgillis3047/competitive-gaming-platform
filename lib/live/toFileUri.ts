/** VisionCamera recorder paths are filesystem paths, not file:// URLs. */
export function toFileUri(path: string): string {
  if (path.startsWith("file://")) return path;
  if (path.startsWith("/")) return `file://${path}`;
  return `file:///${path.replace(/\\/g, "/")}`;
}
