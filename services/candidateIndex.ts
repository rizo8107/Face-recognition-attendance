import { listAllEnrolledRecords, getFileUrl } from './backendService';
import { getPb } from './pbClient';
import type { RecordModel } from 'pocketbase';
import { urlBlobToSigVector, cosineSim, type SigVector, blobToSigVector } from './sigService';

export interface Candidate {
  recId: string;
  userId: string;
  fullName: string;
  imageUrl: string;
  sig?: SigVector;
}

let cache: Candidate[] | null = null;
let building = false;

export async function buildCandidateIndex(): Promise<Candidate[]> {
  if (building) return cache || [];
  building = true;
  try {
    const records = await listAllEnrolledRecords();
    const pb = getPb();
    const items: Candidate[] = [];
    for (const r of records) {
      const file = (r as any).image as string | undefined;
      if (!file) continue;
      const url = pb.files.getUrl(r, file);
      items.push({ recId: r.id, userId: (r as any).userId, fullName: (r as any).fullName, imageUrl: url });
    }
    cache = items;
    return items;
  } finally {
    building = false;
  }
}

export function clearCandidateIndex() { cache = null; }

export async function ensureSigsForAll(): Promise<void> {
  if (!cache) await buildCandidateIndex();
  if (!cache) return;
  await Promise.all(cache.map(async c => {
    if (!c.sig) {
      try { c.sig = await urlBlobToSigVector(c.imageUrl); } catch {}
    }
  }));
}

export async function shortlistByBlob(blob: Blob, k = 5): Promise<Candidate[]> {
  if (!cache) await buildCandidateIndex();
  if (!cache || cache.length === 0) return [];
  const querySig = await blobToSigVector(blob);
  // lazily compute missing sigs (only until we filled k)
  await ensureSigsForAll();
  const scored = cache.map(c => ({ c, s: c.sig ? cosineSim(querySig, c.sig) : -1 }));
  scored.sort((a,b) => b.s - a.s);
  return scored.slice(0, Math.min(k, scored.length)).map(x => x.c);
}
