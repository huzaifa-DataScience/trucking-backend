import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BidContent,
  BidParty,
  BidTeam,
  BidWageRate,
  BidWageDecision,
  BidState,
  BidProjectType,
  BidBuildingType,
  BidPreference,
  BidOffice,
  BidPayrollBurden,
} from '../database/entities';
import { computeBurdenedRate, BurdenItem } from './bidding-calc/labor-burden';
import {
  INTAKE_PARTY_ROLES,
  intakePartiesFromProcess,
  parseProcess,
  partyDedupeKey,
  processMeta,
  type IntakePartyRole,
  type PartyContact,
} from './process/bid-process';

export interface WageRateInput {
  rateLabel: string;
  wage: number;
  fringe: number;
  displayLabel?: string;
  wageAsOf?: string | null;
}

export interface WageDecisionInput {
  decisionNumber: string;
  decisionDate?: string | null;
  county?: string | null;
  jurisdiction?: string | null;
  category?: string | null;
  wage?: number | null;
  fringe?: number | null;
}

type BidPartyItem = {
  id: number;
  name: string | null;
  company: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  inactive: boolean;
  doNotContact: boolean;
  status: string | null;
};

export interface PayrollBurdenInput {
  code: string;
  label: string;
  rateType: 'pct_wage' | 'capped_annual' | 'per_hour';
  rate: number;
  annualCap?: number | null;
  hoursBasis?: number | null;
  includeInBaseRate?: boolean;
}

@Injectable()
export class BiddingLookupsService {
  private readonly logger = new Logger(BiddingLookupsService.name);
  private partiesReady: Promise<void> | null = null;

  constructor(
    @InjectRepository(BidTeam) private readonly teamRepo: Repository<BidTeam>,
    @InjectRepository(BidWageRate) private readonly wageRepo: Repository<BidWageRate>,
    @InjectRepository(BidWageDecision) private readonly wageDecisionRepo: Repository<BidWageDecision>,
    @InjectRepository(BidState) private readonly stateRepo: Repository<BidState>,
    @InjectRepository(BidProjectType) private readonly projectTypeRepo: Repository<BidProjectType>,
    @InjectRepository(BidBuildingType) private readonly buildingTypeRepo: Repository<BidBuildingType>,
    @InjectRepository(BidPreference) private readonly preferenceRepo: Repository<BidPreference>,
    @InjectRepository(BidOffice) private readonly officeRepo: Repository<BidOffice>,
    @InjectRepository(BidPayrollBurden) private readonly burdenRepo: Repository<BidPayrollBurden>,
    @InjectRepository(BidParty) private readonly partyRepo: Repository<BidParty>,
    @InjectRepository(BidContent) private readonly contentRepo: Repository<BidContent>,
  ) {}

  async getParties(
    role?: string,
    q?: string,
    pageRaw?: string | number,
    pageSizeRaw?: string | number,
  ) {
    const page = Math.max(1, Math.trunc(Number(pageRaw)) || 1);
    const pageSize = Math.min(50, Math.max(1, Math.trunc(Number(pageSizeRaw)) || 10));
    const empty = { items: [] as BidPartyItem[], total: 0, page, pageSize };
    const allowed = INTAKE_PARTY_ROLES as readonly string[];
    if (!role || !allowed.includes(role)) return empty;
    try {
      await this.ensurePartiesReady();
    } catch (err: any) {
      this.logger.warn(`Bid_Parties lookup skipped: ${err?.message ?? err}`);
      return empty;
    }
    const qb = this.partyRepo
      .createQueryBuilder('p')
      .where('p.role = :role', { role })
      .orderBy('p.name', 'ASC')
      .addOrderBy('p.id', 'ASC');
    const needle = (q ?? '').trim().slice(0, 80).replace(/[%_]/g, '');
    if (needle) {
      qb.andWhere('(p.name LIKE :q OR p.company LIKE :q OR p.email LIKE :q)', {
        q: `%${needle}%`,
      });
    }
    const total = await qb.clone().getCount();
    const rows = await qb.skip((page - 1) * pageSize).take(pageSize).getMany();
    return {
      items: rows.map((p) => ({
        id: p.id,
        name: p.name || p.company || p.email,
        company: p.company,
        contactName: p.contactName,
        email: p.email,
        phone: p.phone,
        role: p.role,
        inactive: false,
        doNotContact: false,
        status: null as string | null,
      })),
      total,
      page,
      pageSize,
    };
  }

  /** PATCH / POST bid process → directory so the next dropdown hit finds them. */
  async upsertFromProcess(process: unknown): Promise<void> {
    if (!process || typeof process !== 'object') return;
    try {
      await this.ensureTable();
      for (const { role, contact } of intakePartiesFromProcess(parseProcess(process))) {
        await this.upsertOne(role, contact);
      }
    } catch (err: any) {
      this.logger.warn(`Bid_Parties upsert skipped: ${err?.message ?? err}`);
    }
  }

  async getTeams() {
    const rows = await this.teamRepo.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } });
    return rows.map((t) => ({
      id: t.id,
      teamName: t.teamName,
      captain: t.captain,
      bidClerk: t.bidClerk,
      duct1: t.duct1,
      duct2: t.duct2,
      hydronic1: t.hydronic1,
      hydronic2: t.hydronic2,
      plumbing1: t.plumbing1,
      plumbing2: t.plumbing2,
    }));
  }

  /** Add a team (name only; crew roles optional, editable later). */
  async createTeam(teamName: string) {
    const max = await this.teamRepo
      .createQueryBuilder('t')
      .select('MAX(t.sortOrder)', 'm')
      .getRawOne<{ m: number | null }>();
    const team = this.teamRepo.create({
      teamName: teamName.trim(),
      isActive: true,
      sortOrder: (max?.m ?? 0) + 1,
    });
    const saved = await this.teamRepo.save(team);
    return { id: saved.id, teamName: saved.teamName };
  }

  /** Remove a team (soft: mark inactive so existing bids keep their reference). */
  async deleteTeam(id: number) {
    const team = await this.teamRepo.findOne({ where: { id } });
    if (!team) throw new NotFoundException(`Team ${id} not found`);
    team.isActive = false;
    await this.teamRepo.save(team);
    return { ok: true };
  }

  async getWageRates() {
    const rows = await this.wageRepo.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } });
    return rows.map((w) => this.toWageRate(w));
  }

  /** Add a wage rate. Total + a default displayLabel are derived from wage + fringe. */
  async createWageRate(input: WageRateInput) {
    const max = await this.wageRepo
      .createQueryBuilder('w')
      .select('MAX(w.sortOrder)', 'm')
      .getRawOne<{ m: number | null }>();
    const wage = Number(input.wage) || 0;
    const fringe = Number(input.fringe) || 0;
    const row = this.wageRepo.create({
      rateLabel: input.rateLabel.trim(),
      wage,
      fringe,
      total: round2(wage + fringe),
      displayLabel: input.displayLabel?.trim() || this.buildWageDisplay(input.rateLabel, wage, fringe),
      wageAsOf: input.wageAsOf ? new Date(input.wageAsOf) : null,
      isActive: true,
      sortOrder: (max?.m ?? 0) + 1,
    });
    return this.toWageRate(await this.wageRepo.save(row));
  }

  /** Edit a wage rate. Only provided fields change; Total recomputed from wage + fringe. */
  async updateWageRate(id: number, input: Partial<WageRateInput>) {
    const row = await this.wageRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Wage rate ${id} not found`);
    if (input.rateLabel !== undefined) row.rateLabel = input.rateLabel.trim();
    if (input.wage !== undefined) row.wage = Number(input.wage) || 0;
    if (input.fringe !== undefined) row.fringe = Number(input.fringe) || 0;
    row.total = round2(Number(row.wage) + Number(row.fringe));
    if (input.displayLabel !== undefined) {
      row.displayLabel = input.displayLabel.trim() || this.buildWageDisplay(row.rateLabel, Number(row.wage), Number(row.fringe));
    }
    if (input.wageAsOf !== undefined) row.wageAsOf = input.wageAsOf ? new Date(input.wageAsOf) : null;
    return this.toWageRate(await this.wageRepo.save(row));
  }

  /** Remove a wage rate (soft: mark inactive so existing bids keep their reference). */
  async deleteWageRate(id: number) {
    const row = await this.wageRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Wage rate ${id} not found`);
    row.isActive = false;
    await this.wageRepo.save(row);
    return { ok: true };
  }

  private toWageRate(w: BidWageRate) {
    return {
      id: w.id,
      rateLabel: w.rateLabel,
      wage: Number(w.wage),
      fringe: Number(w.fringe),
      total: Number(w.total),
      displayLabel: w.displayLabel,
      wageAsOf: w.wageAsOf instanceof Date ? w.wageAsOf.toISOString().slice(0, 10) : w.wageAsOf,
    };
  }

  private buildWageDisplay(label: string, wage: number, fringe: number): string {
    return `${label.trim()} - W: ($${wage} + F: $${fringe}) = Total of $${round2(wage + fringe)}`;
  }

  // ---- Payroll burden (Cost of Labor Calculator constants) ----

  async getPayrollBurden() {
    const rows = await this.burdenRepo.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } });
    return rows.map((b) => this.toBurden(b));
  }

  async createPayrollBurden(input: PayrollBurdenInput) {
    const max = await this.burdenRepo
      .createQueryBuilder('b')
      .select('MAX(b.sortOrder)', 'm')
      .getRawOne<{ m: number | null }>();
    const row = this.burdenRepo.create({
      code: input.code.trim(),
      label: input.label.trim(),
      rateType: input.rateType,
      rate: Number(input.rate) || 0,
      annualCap: input.annualCap ?? null,
      hoursBasis: input.hoursBasis ?? null,
      includeInBaseRate: input.includeInBaseRate ?? true,
      isActive: true,
      sortOrder: (max?.m ?? 0) + 1,
    });
    return this.toBurden(await this.burdenRepo.save(row));
  }

  async updatePayrollBurden(id: number, input: Partial<PayrollBurdenInput>) {
    const row = await this.burdenRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Payroll burden ${id} not found`);
    if (input.code !== undefined) row.code = input.code.trim();
    if (input.label !== undefined) row.label = input.label.trim();
    if (input.rateType !== undefined) row.rateType = input.rateType;
    if (input.rate !== undefined) row.rate = Number(input.rate) || 0;
    if (input.annualCap !== undefined) row.annualCap = input.annualCap ?? null;
    if (input.hoursBasis !== undefined) row.hoursBasis = input.hoursBasis ?? null;
    if (input.includeInBaseRate !== undefined) row.includeInBaseRate = input.includeInBaseRate;
    return this.toBurden(await this.burdenRepo.save(row));
  }

  async deletePayrollBurden(id: number) {
    const row = await this.burdenRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Payroll burden ${id} not found`);
    row.isActive = false;
    await this.burdenRepo.save(row);
    return { ok: true };
  }

  private toBurden(b: BidPayrollBurden) {
    return {
      id: b.id,
      code: b.code,
      label: b.label,
      rateType: b.rateType,
      rate: Number(b.rate),
      annualCap: b.annualCap === null ? null : Number(b.annualCap),
      hoursBasis: b.hoursBasis,
      includeInBaseRate: b.includeInBaseRate,
    };
  }

  /** Active burden config as plain calc items (for the labor-burden engine). */
  async getBurdenItems(): Promise<BurdenItem[]> {
    const rows = await this.burdenRepo.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } });
    return rows.map((b) => ({
      code: b.code,
      label: b.label,
      rateType: b.rateType,
      rate: Number(b.rate),
      annualCap: b.annualCap === null ? null : Number(b.annualCap),
      hoursBasis: b.hoursBasis,
      includeInBaseRate: b.includeInBaseRate,
    }));
  }

  /**
   * Auto-derive the burdened labor rate for a wage rate (no more typing 51.70 by hand).
   * Uses the wage from the selected Bid_WageRate + the active payroll-burden config.
   */
  async computeBurdenedRateForWage(wageRateId: number) {
    const wageRow = await this.wageRepo.findOne({ where: { id: wageRateId } });
    if (!wageRow) throw new NotFoundException(`Wage rate ${wageRateId} not found`);
    const items = await this.getBurdenItems();
    const result = computeBurdenedRate(Number(wageRow.wage), items);
    return {
      wageRateId: wageRow.id,
      rateLabel: wageRow.rateLabel,
      ...result,
    };
  }

  async getStates() {
    const rows = await this.stateRepo.find({ order: { sortOrder: 'ASC' } });
    return rows.map((s) => ({ stateCode: s.stateCode, salesTaxRate: Number(s.salesTaxRate) }));
  }

  async getProjectTypes() {
    const rows = await this.projectTypeRepo.find({ order: { sortOrder: 'ASC' } });
    return rows.map((r) => ({ id: r.id, name: r.name }));
  }

  async getBuildingTypes() {
    const rows = await this.buildingTypeRepo.find({ order: { sortOrder: 'ASC' } });
    return rows.map((r) => ({ id: r.id, name: r.name }));
  }

  async getPreferences() {
    const rows = await this.preferenceRepo.find({ order: { sortOrder: 'ASC' } });
    return rows.map((r) => ({ id: r.id, name: r.name }));
  }

  async getOffices() {
    const rows = await this.officeRepo.find({ order: { sortOrder: 'ASC' } });
    return rows.map((r) => ({ id: r.id, name: r.name }));
  }

  getProcessMeta() {
    return processMeta();
  }

  async getWageDecisions() {
    const rows = await this.wageDecisionRepo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC' },
    });
    return rows.map((r) => this.toWageDecision(r));
  }

  async createWageDecision(input: WageDecisionInput) {
    const max = await this.wageDecisionRepo
      .createQueryBuilder('w')
      .select('MAX(w.sortOrder)', 'm')
      .getRawOne<{ m: number | null }>();
    const row = this.wageDecisionRepo.create({
      decisionNumber: input.decisionNumber.trim(),
      decisionDate: input.decisionDate ? new Date(input.decisionDate) : null,
      county: input.county?.trim() || null,
      jurisdiction: input.jurisdiction?.trim() || null,
      category: input.category?.trim() || null,
      wage: input.wage ?? null,
      fringe: input.fringe ?? null,
      isActive: true,
      sortOrder: (max?.m ?? 0) + 1,
    });
    return this.toWageDecision(await this.wageDecisionRepo.save(row));
  }

  async updateWageDecision(id: number, input: Partial<WageDecisionInput>) {
    const row = await this.wageDecisionRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Wage decision ${id} not found`);
    if (input.decisionNumber !== undefined) row.decisionNumber = input.decisionNumber.trim();
    if (input.decisionDate !== undefined) {
      row.decisionDate = input.decisionDate ? new Date(input.decisionDate) : null;
    }
    if (input.county !== undefined) row.county = input.county?.trim() || null;
    if (input.jurisdiction !== undefined) row.jurisdiction = input.jurisdiction?.trim() || null;
    if (input.category !== undefined) row.category = input.category?.trim() || null;
    if (input.wage !== undefined) row.wage = input.wage ?? null;
    if (input.fringe !== undefined) row.fringe = input.fringe ?? null;
    return this.toWageDecision(await this.wageDecisionRepo.save(row));
  }

  async deleteWageDecision(id: number) {
    const row = await this.wageDecisionRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Wage decision ${id} not found`);
    row.isActive = false;
    await this.wageDecisionRepo.save(row);
    return { ok: true };
  }

  private toWageDecision(w: BidWageDecision) {
    return {
      id: w.id,
      decisionNumber: w.decisionNumber,
      decisionDate:
        w.decisionDate instanceof Date ? w.decisionDate.toISOString().slice(0, 10) : w.decisionDate,
      county: w.county,
      jurisdiction: w.jurisdiction,
      category: w.category,
      wage: w.wage == null ? null : Number(w.wage),
      fringe: w.fringe == null ? null : Number(w.fringe),
    };
  }

  private ensurePartiesReady(): Promise<void> {
    if (!this.partiesReady) {
      this.partiesReady = this.ensureTable()
        .then(() => this.seedFromBids())
        .catch((err) => {
          this.partiesReady = null;
          throw err;
        });
    }
    return this.partiesReady;
  }

  private async ensureTable(): Promise<void> {
    await this.partyRepo.query(`
      IF OBJECT_ID(N'dbo.Bid_Parties', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Bid_Parties (
          PartyId int IDENTITY(1,1) NOT NULL PRIMARY KEY,
          Role nvarchar(40) NOT NULL,
          Name nvarchar(500) NULL,
          Company nvarchar(500) NULL,
          ContactName nvarchar(500) NULL,
          Email nvarchar(500) NULL,
          Phone nvarchar(100) NULL,
          DedupeKey nvarchar(400) NOT NULL,
          UpdatedAt datetime2 NOT NULL CONSTRAINT DF_Bid_Parties_UpdatedAt DEFAULT SYSUTCDATETIME()
        );
        CREATE UNIQUE INDEX UX_Bid_Parties_Dedupe ON dbo.Bid_Parties(DedupeKey);
        CREATE INDEX IX_Bid_Parties_Role ON dbo.Bid_Parties(Role);
      END
    `);
  }

  /** ponytail: one-shot ProcessJson scan; if this gets slow, a SQL seed job. */
  private async seedFromBids(): Promise<void> {
    const rows = await this.contentRepo
      .createQueryBuilder('c')
      .select('c.processJson', 'processJson')
      .where('c.processJson IS NOT NULL')
      .getRawMany<{ processJson: string }>();
    for (const row of rows) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.processJson);
      } catch {
        continue;
      }
      const p = parseProcess(parsed);
      for (const { role, contact } of intakePartiesFromProcess(p)) {
        await this.upsertOne(role, contact);
      }
    }
  }

  private async upsertOne(role: IntakePartyRole, contact: PartyContact): Promise<void> {
    const key = partyDedupeKey(role, contact);
    if (!key) return;
    const pick = (next: string | null | undefined, prev: string | null) => {
      const t = (next ?? '').trim();
      return t || prev || null;
    };
    const apply = (row: BidParty) => {
      row.role = role;
      row.name = pick(contact.name, row.name);
      row.company = pick(contact.company, row.company);
      row.contactName = pick(contact.contactName, row.contactName);
      row.email = pick(contact.email, row.email);
      row.phone = pick(contact.phone, row.phone);
      if (!row.name) row.name = row.company || row.email;
      if (!row.company) row.company = row.name;
      row.updatedAt = new Date();
    };
    let row = await this.partyRepo.findOne({ where: { dedupeKey: key } });
    if (!row) {
      row = this.partyRepo.create({ dedupeKey: key, role, name: null, company: null, contactName: null, email: null, phone: null });
    }
    apply(row);
    try {
      await this.partyRepo.save(row);
    } catch {
      const again = await this.partyRepo.findOne({ where: { dedupeKey: key } });
      if (!again) return;
      apply(again);
      await this.partyRepo.save(again);
    }
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
