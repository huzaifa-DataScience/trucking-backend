import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BidTeam,
  BidWageRate,
  BidState,
  BidProjectType,
  BidBuildingType,
  BidPreference,
  BidPayrollBurden,
} from '../database/entities';
import { computeBurdenedRate, BurdenItem } from './bidding-calc/labor-burden';

export interface WageRateInput {
  rateLabel: string;
  wage: number;
  fringe: number;
  displayLabel?: string;
  wageAsOf?: string | null;
}

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
  constructor(
    @InjectRepository(BidTeam) private readonly teamRepo: Repository<BidTeam>,
    @InjectRepository(BidWageRate) private readonly wageRepo: Repository<BidWageRate>,
    @InjectRepository(BidState) private readonly stateRepo: Repository<BidState>,
    @InjectRepository(BidProjectType) private readonly projectTypeRepo: Repository<BidProjectType>,
    @InjectRepository(BidBuildingType) private readonly buildingTypeRepo: Repository<BidBuildingType>,
    @InjectRepository(BidPreference) private readonly preferenceRepo: Repository<BidPreference>,
    @InjectRepository(BidPayrollBurden) private readonly burdenRepo: Repository<BidPayrollBurden>,
  ) {}

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
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
