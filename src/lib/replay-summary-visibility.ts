/** Mirrors the replay summary endpoint: students can only read published summaries. */
export function replaySummaryForView<T extends {status:string}>(summary:T|null,studentPreview:boolean):T|null {
  return studentPreview && summary?.status !== "published" ? null : summary;
}
