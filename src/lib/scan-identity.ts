// ST scanner person-ID remap.
//
// Four Subang Taipan staff were enrolled on the ST scanner (device_id
// FV9958286) under person-IDs that already belong to four HQ staff. So a
// scan with person_id=44080099 on the ST device is actually POOJHA, while
// the same person_id on ANY OTHER device is genuinely Ker Kai Loon.
//
// This must be applied at the call-site for EVERY scan we read from
// hikvision_attendance_all before grouping/joining. Never apply it on
// device_id values other than ST_DEVICE_ID, or you'll mis-attribute HQ
// scans to the Subang Taipan staff.

export const ST_DEVICE_ID = "FV9958286";

interface RemapEntry {
  empNo: string;
  name: string;
}

// Source person_id (the HQ staff's id, accidentally reused on the ST scanner)
// → the true Subang Taipan staff who appears under that id on ST scans.
const ST_REMAP: Record<string, RemapEntry> = {
  "44080099": { empNo: "77020106", name: "POOJHA A/P R.GANESH" },
  "44080101": { empNo: "77020090", name: "ALYSSA CHLOE LIM" },
  "44080100": { empNo: "77020088", name: "NEGEETA KAUR A/P RAVINDER SINGH" },
  "44040097": { empNo: "77020087", name: "HAYTHAM TAREK QUMHIYEH" },
};

// Reverse lookup: given a "true" empNo, which person_id does their scanner
// register under on the ST device? Used when filtering/querying by the new
// empNo so we still surface their ST scans (which physically sit under the
// HQ source id in the raw table).
const ST_REVERSE: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [source, entry] of Object.entries(ST_REMAP)) out[entry.empNo] = source;
  return out;
})();

/**
 * Given a raw scan's `deviceId` + `personId` (+ `name`, optional), return the
 * effective identity. ONLY remaps on the ST device — other devices return
 * the inputs unchanged so HQ scans keep their HQ identities.
 */
export function remapStScan(
  deviceId: string | null | undefined,
  personId: string,
  name?: string | null,
): { personId: string; name: string | null } {
  if (deviceId !== ST_DEVICE_ID) return { personId, name: name ?? null };
  const entry = ST_REMAP[personId];
  if (!entry) return { personId, name: name ?? null };
  return { personId: entry.empNo, name: entry.name };
}

/**
 * Reverse lookup: given a true Subang Taipan empNo, return the source
 * person_id that holds their scans on the ST device (so a query for
 * `empNo=77020106` can also pull rows under `person_id=44080099` and remap
 * them in-memory). Returns null if `empNo` isn't in the remap list.
 */
export function stSourceFor(empNo: string): string | null {
  return ST_REVERSE[empNo] ?? null;
}

/** Whether the given personId is one of the four "collided" HQ ids. */
export function isStRemapSource(personId: string): boolean {
  return personId in ST_REMAP;
}

/** Whether the given empNo is one of the four ST staff that lives under a HQ id. */
export function isStRemapTarget(empNo: string): boolean {
  return empNo in ST_REVERSE;
}
