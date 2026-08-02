import "server-only";
import type { Access } from "@/lib/access/engine";
import { queryCrmDb } from "@/lib/crm-db";

// ─────────────────────────────────────────────────────────────────────────────
// Centralized CNS branch-scoping. Every CNS route resolves "which branches may
// this caller see?" from ONE place — their access grant (user → employment →
// branch/region) — instead of a per-route ad-hoc query. The portal↔CRM join key
// is the branch CODE; region uses the shared A/B/C.
//
// The pipeline lives under crm_branch; tickets under tkt_branch (a separate
// branch table). Both are resolved from the same allowed-codes set.
// ─────────────────────────────────────────────────────────────────────────────

/** { all:true } = no restriction (global). Otherwise the concrete id allow-list
 *  (possibly empty → the caller may see nothing). */
export type BranchIdScope = { all: true } | { all: false; ids: string[] };

// Numeric codes compare by value ("02" == "2"); everything else by upper text.
function normCode(s: string | null | undefined): string {
  const t = (s ?? "").trim().toUpperCase();
  return /^\d+$/.test(t) ? String(Number(t)) : t;
}

// "02 Ebright (Subang Taipan)" → "02"; else the code column.
function crmBranchCode(name: string, code: string | null): string {
  const m = name.match(/^(\d+)\s+Ebright/i);
  return m ? m[1] : (code ?? "");
}

async function resolveTenantId(): Promise<string | null> {
  const r = await queryCrmDb<{ id: string }>(
    `SELECT id FROM crm.crm_tenant WHERE slug IN ('ebright','ebright-demo') ORDER BY "createdAt" ASC LIMIT 1`,
  );
  if (!r) return null;
  if (r.rows[0]?.id) return r.rows[0].id;
  const f = await queryCrmDb<{ id: string }>(`SELECT id FROM crm.crm_tenant ORDER BY "createdAt" ASC LIMIT 1`);
  return f?.rows[0]?.id ?? null;
}

/** The normalized branch codes a caller may see for a feature, or "all". */
async function allowedCodes(access: Access, feature: string): Promise<"all" | Set<string>> {
  const c = access.constraint(feature, "view");
  switch (c.kind) {
    case "global":
      return "all";
    case "branch": {
      const code = normCode(access.actor.branchCode);
      return new Set(code ? [code] : []);
    }
    case "region": {
      if (!c.region) return new Set();
      const tenantId = await resolveTenantId();
      if (!tenantId) return new Set();
      const res = await queryCrmDb<{ code: string | null; name: string }>(
        `SELECT code, name FROM crm.crm_branch WHERE "tenantId" = $1 AND region = $2`,
        [tenantId, c.region],
      );
      return new Set((res?.rows ?? []).map((b) => normCode(crmBranchCode(b.name, b.code))));
    }
    default:
      // department / own / none don't map to a CNS branch view.
      return new Set();
  }
}

/** Allowed crm_branch (pipeline) ids for a feature. */
export async function resolveCrmBranchIds(access: Access, feature: string): Promise<BranchIdScope> {
  const codes = await allowedCodes(access, feature);
  if (codes === "all") return { all: true };
  if (codes.size === 0) return { all: false, ids: [] };
  const tenantId = await resolveTenantId();
  if (!tenantId) return { all: false, ids: [] };
  const res = await queryCrmDb<{ id: string; code: string | null; name: string }>(
    `SELECT id, code, name FROM crm.crm_branch WHERE "tenantId" = $1`,
    [tenantId],
  );
  const ids = (res?.rows ?? [])
    .filter((b) => codes.has(normCode(crmBranchCode(b.name, b.code))))
    .map((b) => b.id);
  return { all: false, ids };
}

/** Allowed tkt_branch (tickets) ids for a feature. */
export async function resolveTktBranchIds(access: Access, feature: string): Promise<BranchIdScope> {
  const codes = await allowedCodes(access, feature);
  if (codes === "all") return { all: true };
  if (codes.size === 0) return { all: false, ids: [] };
  const tenantId = await resolveTenantId();
  if (!tenantId) return { all: false, ids: [] };
  const res = await queryCrmDb<{ id: string; code: string | null; branch_number: string | null }>(
    `SELECT id, code, branch_number FROM crm.tkt_branch WHERE tenant_id = $1`,
    [tenantId],
  );
  const ids = (res?.rows ?? [])
    .filter((b) => codes.has(normCode(b.code)) || codes.has(normCode(b.branch_number)))
    .map((b) => b.id);
  return { all: false, ids };
}
