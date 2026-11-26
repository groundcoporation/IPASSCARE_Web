interface DownloadDependencies {
  document: Pick<Document, 'createElement' | 'body'>;
  url: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
}

/** Browser-only delivery. Builders contain no DOM, database calls or filesystem writes. */
export function downloadExcel(buffer: BlobPart, filename: string, dependencies?: DownloadDependencies) {
  const doc = dependencies?.document ?? document;
  const urls = dependencies?.url ?? URL;
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const objectUrl = urls.createObjectURL(blob);
  let anchor: HTMLAnchorElement | undefined;
  try {
    anchor = doc.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    doc.body.appendChild(anchor);
    anchor.click();
  } finally {
    try { anchor?.remove(); } finally { urls.revokeObjectURL(objectUrl); }
  }
}
