// In-memory & file-persisted mock database for PatchPay local development & demo mode
import fs from 'fs';
import path from 'path';

export interface BountyRow {
  id: string;
  owner: string;
  repo: string;
  issue_number: number;
  issue_title: string;
  criteria: string;
  scout?: unknown;
  amount_sats: number;
  maintainer_login: string;
  maintainer_addr: string;
  oracle_pubkey: string;
  deadline_unix: number;
  escrow_address: string;
  network: 'chipnet' | 'mainnet';
  status: 'awaiting_funds' | 'open' | 'in_review' | 'verified' | 'paid' | 'refunded' | 'cancelled';
  created_at: string;
}

export interface ProofRow {
  id: string;
  bounty_id: string;
  pr_number: number;
  proof: unknown;
  proof_hash: string;
  checks_green: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  created_at: string;
}

export interface PaymentRow {
  id: string;
  bounty_id: string;
  proof_id?: string | null;
  kind: 'fund' | 'release' | 'refund' | 'receipt_nft';
  txid: string;
  amount_sats?: number | null;
  recipient?: string | null;
  oracle_sig?: string | null;
  created_at: string;
}

export interface EventRow {
  id: number;
  bounty_id: string;
  actor: string;
  action: string;
  data?: unknown;
  created_at: string;
}

export interface DatabaseState {
  bounties: BountyRow[];
  proofs: ProofRow[];
  payments: PaymentRow[];
  events: EventRow[];
}

const SEED_DATA: DatabaseState = {
  bounties: [
    {
      id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      owner: 'cashscript',
      repo: 'cashscript',
      issue_number: 104,
      issue_title: 'Fix fee estimation when spending covenant UTXOs in batch transactions',
      criteria: '- Reproduce fee discrepancy with automated test\n- Update transaction builder to account for covenant script size\n- All CI checks green',
      scout: {
        summary: 'CashScript transaction builder underestimates fee on covenants with multi-byte OP_RETURN proofs.',
        difficulty: 'medium',
        estimatedHours: 4,
        likelyFiles: ['packages/cashscript/src/Transaction.ts'],
        acceptanceCriteria: ['Reproduce fee discrepancy with test', 'Update fee calculation', 'Pass CI'],
        agentFriendly: true,
      },
      amount_sats: 100000,
      maintainer_login: 'RoscoKalis',
      maintainer_addr: 'bchtest:qqqszqgpqyqszqgpqyqszqgpqyqszqgpqy8kvl0kqa',
      oracle_pubkey: '03823ebf361a792cc9a3eb72ff481291298665f41994b76ca42a974febeb66b828',
      deadline_unix: 1795000000,
      escrow_address: 'bchtest:prf259q20kqqh8f4z3p3u6s4y3263ep85qh5x3456q',
      network: 'chipnet',
      status: 'paid',
      created_at: '2026-11-15T10:00:00.000Z',
    },
    {
      id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
      owner: 'bitauth',
      repo: 'libauth',
      issue_number: 88,
      issue_title: 'Implement zero-copy slice parser for CashTokens commitment bytecode',
      criteria: '- Add unit tests for zero-copy commitment reading\n- Benchmark sub-millisecond parsing\n- Maintain full backward compatibility',
      scout: {
        summary: 'Optimization of CashTokens commitment parser for high-throughput node validation.',
        difficulty: 'hard',
        estimatedHours: 6,
        likelyFiles: ['src/lib/vm/instruction-sets/bch/2026/tokens.ts'],
        acceptanceCriteria: ['Zero-copy parsing test', 'Zero memory regressions'],
        agentFriendly: true,
      },
      amount_sats: 250000,
      maintainer_login: 'bitjson',
      maintainer_addr: 'bchtest:qqqszqgpqyqszqgpqyqszqgpqyqszqgpqy8kvl0kqa',
      oracle_pubkey: '03823ebf361a792cc9a3eb72ff481291298665f41994b76ca42a974febeb66b828',
      deadline_unix: 1795500000,
      escrow_address: 'bchtest:prf837k40pqqm7f2z1p5u4s2y1243ep75qh9x1234w',
      network: 'chipnet',
      status: 'in_review',
      created_at: '2026-11-16T14:00:00.000Z',
    },
    {
      id: 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f',
      owner: 'pixijs',
      repo: 'pixijs',
      issue_number: 9821,
      issue_title: 'WebGL context loss handling on mobile Safari 18',
      criteria: '- Handle WEBGL_lose_context extension restoration cleanly\n- Add mock automated tests for canvas remount',
      scout: {
        summary: 'Mobile Safari 18 drops WebGL context aggressively when backgrounded.',
        difficulty: 'easy',
        estimatedHours: 3,
        likelyFiles: ['src/rendering/renderers/gl/GlContextSystem.ts'],
        acceptanceCriteria: ['Proper event listeners on context loss', 'Clean texture re-upload on restore'],
        agentFriendly: true,
      },
      amount_sats: 500000,
      maintainer_login: 'GoodBoyDigital',
      maintainer_addr: 'bchtest:qqqszqgpqyqszqgpqyqszqgpqyqszqgpqy8kvl0kqa',
      oracle_pubkey: '03823ebf361a792cc9a3eb72ff481291298665f41994b76ca42a974febeb66b828',
      deadline_unix: 1796000000,
      escrow_address: 'bchtest:prf921j51qqqn6f3z2p4u5s1y2354ep65qh8x2345v',
      network: 'chipnet',
      status: 'open',
      created_at: '2026-11-17T18:00:00.000Z',
    },
  ],
  proofs: [
    {
      id: 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c',
      bounty_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      pr_number: 105,
      proof_hash: '0989e45e8bd91c8578a946bd3175996316a132768a19bb9e61bd7e663ead6686',
      checks_green: true,
      status: 'paid',
      created_at: '2026-11-16T12:00:00.000Z',
      proof: {
        v: 1,
        bounty: {
          id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
          repo: 'cashscript/cashscript',
          issue: 104,
          amountSats: '100000',
          escrow: 'bchtest:prf259q20kqqh8f4z3p3u6s4y3263ep85qh5x3456q',
        },
        patch: {
          pr: 105,
          headSha: '8f4b23d9a1c5e67290f84a2b91c834d5e78201ac',
          mergeSha: '9a3c14f82b7d5e6012a93b4c81d24e5f679012ab',
          mergedBy: 'RoscoKalis',
          diffSha256: '4a6b2c8d1e0f3958a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4',
          filesChanged: 3,
          additions: 42,
          deletions: 11,
        },
        checks: [
          { name: 'ci/test (node 20)', conclusion: 'success', url: 'https://github.com/cashscript/cashscript/actions/runs/10401' },
          { name: 'ci/lint', conclusion: 'success', url: 'https://github.com/cashscript/cashscript/actions/runs/10402' },
          { name: 'contracts/compile', conclusion: 'success', url: 'https://github.com/cashscript/cashscript/actions/runs/10403' },
        ],
        review: {
          model: 'gemini-2.5-flash',
          criteriaMet: true,
          score: 95,
          risks: [],
          slopSignals: [],
        },
        contributor: {
          github: 'bch-builder',
          kind: 'human',
          payoutAddress: 'bchtest:qq9skzctpv9skzctpv9skzctpv9skzctpv52mcu2ne',
        },
        approvedBy: 'RoscoKalis',
        createdAt: '2026-11-16T12:00:00.000Z',
      },
    },
    {
      id: 'f2b3c4d5-e6a7-4b8c-9d0e-1f2a3b4c5d6e',
      bounty_id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
      pr_number: 89,
      proof_hash: '7e63850a22fd51b3e0647d624fce848961478e75cd6acf40a574ca7361029944',
      checks_green: true,
      status: 'pending',
      created_at: '2026-11-17T15:30:00.000Z',
      proof: {
        v: 1,
        bounty: {
          id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
          repo: 'bitauth/libauth',
          issue: 88,
          amountSats: '250000',
          escrow: 'bchtest:prf837k40pqqm7f2z1p5u4s2y1243ep75qh9x1234w',
        },
        patch: {
          pr: 89,
          headSha: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
          mergeSha: null,
          mergedBy: null,
          diffSha256: '9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e',
          filesChanged: 2,
          additions: 28,
          deletions: 4,
        },
        checks: [
          { name: 'ci/test', conclusion: 'success', url: 'https://github.com/bitauth/libauth/actions/runs/8801' },
          { name: 'ci/bench', conclusion: 'success', url: 'https://github.com/bitauth/libauth/actions/runs/8802' },
        ],
        review: {
          model: 'gemini-2.5-flash',
          criteriaMet: true,
          score: 88,
          risks: ['Reviewer should double-check zero-copy buffer slice bounds'],
          slopSignals: [],
        },
        contributor: {
          github: 'agent-patchbot',
          kind: 'agent',
          payoutAddress: 'bchtest:qqtpv9skzctpv9skzctpv9skzctpv9skzclawwsu26',
        },
        approvedBy: null,
        createdAt: '2026-11-17T15:30:00.000Z',
      },
    },
  ],
  payments: [
    {
      id: 'pay-1',
      bounty_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      kind: 'fund',
      txid: '68c4a919320e4b7b9d7ef26e5e89a243e82ef73887c2b64d60a1e3b6e828a211',
      amount_sats: 100000,
      recipient: null,
      oracle_sig: null,
      created_at: '2026-11-15T10:05:00.000Z',
    },
    {
      id: 'pay-2',
      bounty_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      proof_id: 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c',
      kind: 'release',
      txid: '92d1b824301c5f8e0a7df35b4c2e1a0b9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f41',
      amount_sats: 97000,
      recipient: 'bchtest:qq9skzctpv9skzctpv9skzctpv9skzctpv52mcu2ne',
      oracle_sig: '8204918239014812049812409812409182409182409182049182049812049812',
      created_at: '2026-11-16T12:30:00.000Z',
    },
    {
      id: 'pay-3',
      bounty_id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
      kind: 'fund',
      txid: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
      amount_sats: 250000,
      recipient: null,
      oracle_sig: null,
      created_at: '2026-11-16T14:05:00.000Z',
    },
    {
      id: 'pay-4',
      bounty_id: 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f',
      kind: 'fund',
      txid: 'f9e8d7c6b5a43210f9e8d7c6b5a43210f9e8d7c6b5a43210f9e8d7c6b5a43210',
      amount_sats: 500000,
      recipient: null,
      oracle_sig: null,
      created_at: '2026-11-17T18:05:00.000Z',
    },
  ],
  events: [
    { id: 1, bounty_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', actor: 'RoscoKalis', action: 'bounty.created', data: { amountSats: 100000 }, created_at: '2026-11-15T10:00:00.000Z' },
    { id: 2, bounty_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', actor: 'chain', action: 'bounty.funded', data: { total: '100000' }, created_at: '2026-11-15T10:05:00.000Z' },
    { id: 3, bounty_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', actor: 'github', action: 'patchproof.verified', data: { pr: 105, score: 95 }, created_at: '2026-11-16T12:00:00.000Z' },
    { id: 4, bounty_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', actor: 'RoscoKalis', action: 'bounty.approved', data: { proofId: 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c' }, created_at: '2026-11-16T12:30:00.000Z' },
    { id: 5, bounty_id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', actor: 'bitjson', action: 'bounty.created', data: { amountSats: 250000 }, created_at: '2026-11-16T14:00:00.000Z' },
    { id: 6, bounty_id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', actor: 'chain', action: 'bounty.funded', data: { total: '250000' }, created_at: '2026-11-16T14:05:00.000Z' },
    { id: 7, bounty_id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', actor: 'agent-patchbot', action: 'pr.opened', data: { pr: 89, agent: true }, created_at: '2026-11-17T15:00:00.000Z' },
    { id: 8, bounty_id: 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', actor: 'GoodBoyDigital', action: 'bounty.created', data: { amountSats: 500000 }, created_at: '2026-11-17T18:00:00.000Z' },
    { id: 9, bounty_id: 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', actor: 'chain', action: 'bounty.funded', data: { total: '500000' }, created_at: '2026-11-17T18:05:00.000Z' },
  ],
};

const DB_FILE = path.join(process.cwd(), '.patchpay-db.json');

function loadState(): DatabaseState {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch {}
  return JSON.parse(JSON.stringify(SEED_DATA));
}

// Loaded lazily: real (Supabase) mode never imports state from disk.
let memo: DatabaseState | null = null;
const state = (): DatabaseState => (memo ??= loadState());

function saveState() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(state(), null, 2), 'utf-8');
  } catch {}
}

type Filter = (row: Record<string, unknown>) => boolean;

export class MockQueryBuilder {
  private tableName: keyof DatabaseState;
  private filters: Filter[] = [];
  private sortColumn?: string;
  private sortAsc = true;
  private limitCount?: number;
  private selectFields = '*';
  private updateData?: Record<string, unknown>;
  private insertData?: Record<string, unknown> | Record<string, unknown>[];

  constructor(table: string) {
    this.tableName = table as keyof DatabaseState;
    if (!state()[this.tableName]) {
      (state() as unknown as Record<string, unknown[]>)[table] = [];
    }
  }

  select(fields = '*') {
    this.selectFields = fields;
    return this;
  }

  eq(col: string, val: unknown) {
    this.filters.push((row) => row[col] === val);
    return this;
  }

  neq(col: string, val: unknown) {
    this.filters.push((row) => row[col] !== val);
    return this;
  }

  in(col: string, vals: unknown[]) {
    this.filters.push((row) => vals.includes(row[col]));
    return this;
  }

  match(criteria: Record<string, unknown>) {
    for (const [col, val] of Object.entries(criteria)) {
      this.filters.push((row) => row[col] === val);
    }
    return this;
  }

  order(col: string, options?: { ascending?: boolean }) {
    this.sortColumn = col;
    this.sortAsc = options?.ascending ?? true;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  insert(data: Record<string, unknown> | Record<string, unknown>[]) {
    this.insertData = data;
    const rows = state()[this.tableName] as unknown as Record<string, unknown>[];
    const items = Array.isArray(data) ? data : [data];
    for (const item of items) {
      if (!item.id && this.tableName === 'events') {
        item.id = rows.length + 1;
      }
      if (!item.created_at) {
        item.created_at = new Date().toISOString();
      }
      rows.push(item);
    }
    saveState();
    return this;
  }

  update(data: Record<string, unknown>) {
    this.updateData = data;
    return this;
  }

  upsert(data: Record<string, unknown>, options?: { onConflict?: string }) {
    const rows = state()[this.tableName] as unknown as Record<string, unknown>[];
    const conflicts = options?.onConflict ? options.onConflict.split(',') : ['id'];
    const existingIndex = rows.findIndex((r) => conflicts.every((c) => r[c] === data[c]));
    if (existingIndex >= 0) {
      rows[existingIndex] = { ...rows[existingIndex], ...data };
    } else {
      rows.push({ ...data, created_at: data.created_at ?? new Date().toISOString() });
    }
    saveState();
    return this;
  }

  private execute() {
    let rows = [...((state()[this.tableName] ?? []) as unknown as Record<string, unknown>[])];

    // If updateData is queued, apply updates to matching rows
    if (this.updateData) {
      const updatedRows: Record<string, unknown>[] = [];
      for (let i = 0; i < rows.length; i++) {
        if (this.filters.every((f) => f(rows[i]))) {
          rows[i] = { ...rows[i], ...this.updateData };
          updatedRows.push(rows[i]);
        }
      }
      saveState();
      rows = updatedRows;
    } else {
      // Filter rows
      for (const filter of this.filters) {
        rows = rows.filter(filter);
      }
    }

    // Sort rows
    if (this.sortColumn) {
      const col = this.sortColumn;
      const asc = this.sortAsc ? 1 : -1;
      rows.sort((a, b) => {
        const valA = a[col] as string | number | undefined | null;
        const valB = b[col] as string | number | undefined | null;
        if (valA === valB) return 0;
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;
        return valA > valB ? asc : -asc;
      });
    }

    // Limit
    if (this.limitCount !== undefined) {
      rows = rows.slice(0, this.limitCount);
    }

    // Handle joins (e.g., '*, bounties(*)')
    if (this.selectFields.includes('bounties(*)') && this.tableName === 'proofs') {
      const bounties = state().bounties as unknown as Record<string, unknown>[];
      rows = rows.map((p) => {
        const bounty = bounties.find((b) => b.id === p.bounty_id) ?? null;
        return { ...p, bounties: bounty };
      });
    }

    return rows;
  }

  async single() {
    const rows = this.execute();
    return { data: rows[0] ?? null, error: rows[0] ? null : { message: 'Row not found' } };
  }

  async maybeSingle() {
    const rows = this.execute();
    return { data: rows[0] ?? null, error: null };
  }

  // Promise interface for direct await
  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    const rows = this.execute();
    return Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected);
  }
}

export function createMockDbClient() {
  return {
    from: (table: string) => new MockQueryBuilder(table),
  };
}
