import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ExternalSite,
  Hauler,
  Job,
  OpsDisposalRate,
  OpsHaulTicket,
  OpsHaulerRate,
} from '../database/entities';
import { DisposalRateDto, HaulTicketDto, HaulerRateDto } from './operations.dto';
import {
  SENTINEL_JOB,
  cents,
  disposalCost,
  disposalLabel,
  haulerLabel,
  num,
  totalCost,
  truckingCost,
} from './haul-cost';

export const LEED_KEYS = [
  'lightTubes',
  'metalsDirect',
  'metalsReclaimed',
  'insulation',
  'wood',
  'paper',
  'aggregates',
  'plastics',
  'drywall',
  'boardFeetWood',
  'dirt',
  'lumber',
  'brickDeconstructed',
  'brickPallets',
  'roofing',
  'landfill',
] as const;

export const AGGREGATE_KEYS = ['rc57', 'rc6', 'rc2', 'cr57', 'dirtTons'] as const;

type QtyKey = (typeof LEED_KEYS)[number] | (typeof AGGREGATE_KEYS)[number];

/** Disposal card type from free-text `unitLabel`; same rule as the Disposal rates page ("Recyle" counts as Recycle). */
function disposalType(unitLabel: string | null | undefined): string {
  const u = (unitLabel ?? '').trim().toLowerCase();
  if (!u) return 'Not set';
  if (u.startsWith('rec')) return 'Recycle';
  if (u === 'import') return 'Import';
  if (u === 'export') return 'Export';
  if (u === 'asbestos') return 'Asbestos';
  return 'Other';
}

function blank(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

function dec(value: unknown): string | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return String(n);
}

function day(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return match ? match[1] : null;
}

@Injectable()
export class OperationsService {
  constructor(
    @InjectRepository(OpsHaulerRate) private readonly haulers: Repository<OpsHaulerRate>,
    @InjectRepository(OpsDisposalRate) private readonly disposal: Repository<OpsDisposalRate>,
    @InjectRepository(OpsHaulTicket) private readonly hauls: Repository<OpsHaulTicket>,
    @InjectRepository(Job) private readonly jobs: Repository<Job>,
    @InjectRepository(Hauler) private readonly companies: Repository<Hauler>,
    @InjectRepository(ExternalSite) private readonly sites: Repository<ExternalSite>,
  ) {}

  meta() {
    return {
      cost: 'trucking = rate per load + rate per hour * hours; disposal = cost per load + cost per ton * billable tons + cost per CY * catalog truck size; total = trucking + disposal',
      billableTons: '0 when the card includes more tons than the load weighs, otherwise weight minus tons included',
      jobName: 'Ref_Jobs name. --- when the job number is not on a job.',
      notPriced: ['leed', 'aggregates', 'showUpHours'],
      storedCosts: false,
    };
  }

  async listHaulerRates() {
    const rows = await this.haulers.find({ order: { companyName: 'ASC', id: 'ASC' } });
    return rows.map((row) => this.haulerView(row));
  }

  /** One page of hauler rate cards; same search (label, company, category) and order as the full list. */
  async listHaulerRatesPage(opts: {
    page?: number;
    pageSize?: number;
    search?: string;
    company?: string;
    status: 'active' | 'inactive' | 'all';
  }) {
    const term = opts.search?.trim().toLowerCase();
    const company = opts.company?.trim();
    const every = await this.listHaulerRates();
    // Company + search first, so the status counts describe what the switch would show.
    const matched = every.filter((r) => {
      if (company && r.companyName !== company) return false;
      if (!term) return true;
      return [r.label, r.companyName, r.category].filter(Boolean).join(' ').toLowerCase().includes(term);
    });
    const active = matched.filter((r) => r.isActive).length;
    const all = matched.filter((r) =>
      opts.status === 'active' ? r.isActive : opts.status === 'inactive' ? !r.isActive : true,
    );
    const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50));
    const pages = Math.max(1, Math.ceil(all.length / pageSize));
    const page = Math.min(pages, Math.max(1, opts.page ?? 1));
    const companies = [...new Set(every.map((r) => r.companyName).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    );
    // allCount = every card before filters, for the "N of M cards" footer.
    return {
      items: all.slice((page - 1) * pageSize, page * pageSize),
      total: all.length,
      allCount: every.length,
      page,
      pageSize,
      statusCounts: { active, inactive: matched.length - active, all: matched.length },
      companies,
    };
  }

  async saveHaulerRate(body: HaulerRateDto, id?: number) {
    const row = id ? await this.haulers.findOne({ where: { id } }) : this.haulers.create();
    if (!row) throw new NotFoundException('Hauler rate not found');
    if (body.companyName !== undefined) row.companyName = blank(body.companyName) ?? '';
    if (!row.companyName) throw new BadRequestException('companyName is required');
    if (body.category !== undefined) row.category = blank(body.category);
    if (body.ratePerLoad !== undefined) row.ratePerLoad = dec(body.ratePerLoad) ?? '0';
    if (body.ratePerHour !== undefined) row.ratePerHour = dec(body.ratePerHour) ?? '0';
    if (body.unit !== undefined) row.unit = blank(body.unit);
    if (body.showUpHours !== undefined) row.showUpHours = dec(body.showUpHours);
    if (body.address !== undefined) row.address = blank(body.address);
    if (body.phone !== undefined) row.phone = blank(body.phone);
    if (body.contact !== undefined) row.contact = blank(body.contact);
    if (body.email !== undefined) row.email = blank(body.email);
    if (body.coi !== undefined) row.coi = blank(body.coi);
    if (body.isActive !== undefined) row.isActive = body.isActive;
    if (body.companyId !== undefined) {
      row.companyId = await this.companyOrNull(body.companyId);
    }
    const saved = await this.haulers.save(row);
    return this.haulerView(saved);
  }

  async listDisposalRates() {
    const rows = await this.disposal.find({ order: { companyName: 'ASC', id: 'ASC' } });
    return rows.map((row) => this.disposalView(row));
  }

  /**
   * One page of disposal rate cards. Filters, type counts and sorting match the Disposal rates page:
   * the type comes from `unitLabel` (typos like "Recyle" count as Recycle), blanks sort last.
   */
  async listDisposalRatesPage(opts: {
    page?: number;
    pageSize?: number;
    search?: string;
    company?: string;
    type?: string;
    status: 'active' | 'inactive' | 'all';
    sortBy?: string;
    sortDir: 'asc' | 'desc';
  }) {
    const term = opts.search?.trim().toLowerCase();
    const company = opts.company?.trim();
    const every = await this.listDisposalRates();
    type Card = (typeof every)[number];
    // Everything except the Type filter; the type switch counts come from this.
    const matched = every.filter((r) => {
      if (opts.status === 'active' && !r.isActive) return false;
      if (opts.status === 'inactive' && r.isActive) return false;
      if (company && r.companyName !== company) return false;
      if (!term) return true;
      return [r.label, r.companyName, r.category, r.unitLabel, r.address]
        .filter(Boolean)
        .join('\n')
        .toLowerCase()
        .includes(term);
    });
    const typeCounts: Record<string, number> = {};
    for (const r of matched) typeCounts[disposalType(r.unitLabel)] = (typeCounts[disposalType(r.unitLabel)] ?? 0) + 1;
    let all = opts.type && opts.type !== 'all' ? matched.filter((r) => disposalType(r.unitLabel) === opts.type) : matched;

    const sortValue: Record<string, (r: Card) => string | number | null> = {
      company: (r) => r.companyName,
      type: (r) => disposalType(r.unitLabel),
      material: (r) => r.category ?? '',
      costPerLoad: (r) => r.costPerLoad ?? null,
      costPerTon: (r) => r.costPerTon ?? null,
      costPerCy: (r) => r.costPerCy ?? null,
    };
    const value = opts.sortBy ? sortValue[opts.sortBy] : undefined;
    if (value) {
      const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
      const isBlank = (v: string | number | null) => v == null || v === '' || (typeof v === 'number' && Number.isNaN(v));
      all = [...all].sort((x, y) => {
        const a = value(x);
        const b = value(y);
        if (isBlank(a) || isBlank(b)) return isBlank(a) === isBlank(b) ? 0 : isBlank(a) ? 1 : -1;
        const c = typeof a === 'number' && typeof b === 'number' ? a - b : collator.compare(String(a), String(b));
        return opts.sortDir === 'desc' ? -c : c;
      });
    }

    const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50));
    const pages = Math.max(1, Math.ceil(all.length / pageSize));
    const page = Math.min(pages, Math.max(1, opts.page ?? 1));
    const companies = [...new Set(every.map((r) => r.companyName).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    );
    return {
      items: all.slice((page - 1) * pageSize, page * pageSize),
      total: all.length,
      allCount: every.length,
      page,
      pageSize,
      typeCounts: { ...typeCounts, all: matched.length },
      companies,
    };
  }

  async saveDisposalRate(body: DisposalRateDto, id?: number) {
    const row = id ? await this.disposal.findOne({ where: { id } }) : this.disposal.create();
    if (!row) throw new NotFoundException('Disposal rate not found');
    if (body.companyName !== undefined) row.companyName = blank(body.companyName) ?? '';
    if (!row.companyName) throw new BadRequestException('companyName is required');
    if (body.unitLabel !== undefined) row.unitLabel = blank(body.unitLabel);
    if (body.category !== undefined) row.category = blank(body.category);
    if (body.costPerLoad !== undefined) row.costPerLoad = dec(body.costPerLoad) ?? '0';
    if (body.costPerTon !== undefined) row.costPerTon = dec(body.costPerTon) ?? '0';
    if (body.costPerCy !== undefined) row.costPerCy = dec(body.costPerCy) ?? '0';
    if (body.truckSizeCy !== undefined) row.truckSizeCy = dec(body.truckSizeCy) ?? '0';
    if (body.tonsIncluded !== undefined) row.tonsIncluded = dec(body.tonsIncluded) ?? '0';
    if (body.address !== undefined) row.address = blank(body.address);
    if (body.phone !== undefined) row.phone = blank(body.phone);
    if (body.contact !== undefined) row.contact = blank(body.contact);
    if (body.email !== undefined) row.email = blank(body.email);
    if (body.isActive !== undefined) row.isActive = body.isActive;
    if (body.siteId !== undefined) row.siteId = await this.siteOrNull(body.siteId);
    const saved = await this.disposal.save(row);
    return this.disposalView(saved);
  }

  async listHauls(q: { from?: string; to?: string; jobNumber?: string; haulerRateId?: number; disposalRateId?: number }) {
    const rows = await this.haulQuery(q).getMany();
    return rows.map((row) => this.haulView(row));
  }

  /**
   * One page of the haul log plus totals for everything that matches. Costs are worked out from the
   * rate cards in code, so all matching hauls are priced here; only the requested page is sent back.
   */
  async listHaulsPage(
    q: { from?: string; to?: string; jobNumber?: string; haulerRateId?: number; disposalRateId?: number },
    opts: { page?: number; pageSize?: number; search?: string },
  ) {
    const term = opts.search?.trim().toLowerCase();
    const all = (await this.listHauls(q)).filter((r) => {
      if (!term) return true;
      return [r.jobNumber, r.jobName, r.haulerLabel, r.disposalLabel, r.goelTicketNumber, r.haulingTicketNumber, r.disposalTicketNumber]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
    const totals = all.reduce(
      (sum, r) => ({
        loads: sum.loads + 1,
        truckingCost: cents(sum.truckingCost + (r.truckingCost ?? 0)),
        disposalCost: cents(sum.disposalCost + (r.disposalCost ?? 0)),
        totalCost: cents(sum.totalCost + (r.totalCost ?? 0)),
      }),
      { loads: 0, truckingCost: 0, disposalCost: 0, totalCost: 0 },
    );
    const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50));
    const pages = Math.max(1, Math.ceil(all.length / pageSize));
    const page = Math.min(pages, Math.max(1, opts.page ?? 1));
    return {
      items: all.slice((page - 1) * pageSize, page * pageSize),
      total: all.length,
      page,
      pageSize,
      totals,
    };
  }

  async saveHaul(body: HaulTicketDto, id?: number) {
    const row = id ? await this.hauls.findOne({ where: { id } }) : this.hauls.create();
    if (!row) throw new NotFoundException('Haul not found');
    if (!id || body.ticketDate !== undefined) {
      const ticketDate = day(body.ticketDate);
      if (!ticketDate) throw new BadRequestException('ticketDate must be YYYY-MM-DD');
      row.ticketDate = ticketDate;
    }
    if (body.jobNumber !== undefined) row.jobNumber = blank(body.jobNumber);
    if (body.jobName !== undefined) row.jobName = blank(body.jobName);
    if (body.jobId !== undefined) {
      row.jobId = body.jobId == null ? null : await this.jobOrThrow(body.jobId);
    } else if (row.jobNumber) {
      const match = await this.jobs.findOne({ where: { jobNumber: row.jobNumber } });
      row.jobId = match?.id ?? null;
    }
    if (body.haulerRateId !== undefined) {
      row.haulerRateId = body.haulerRateId == null ? null : await this.haulerOrThrow(body.haulerRateId);
    }
    if (body.disposalRateId !== undefined) {
      row.disposalRateId = body.disposalRateId == null ? null : await this.disposalOrThrow(body.disposalRateId);
    }
    if (body.hours !== undefined) row.hours = dec(body.hours);
    if (body.weightTons !== undefined) row.weightTons = dec(body.weightTons);
    if (body.goelTicketNumber !== undefined) row.goelTicketNumber = blank(body.goelTicketNumber);
    if (body.haulingTicketNumber !== undefined) row.haulingTicketNumber = blank(body.haulingTicketNumber);
    if (body.disposalTicketNumber !== undefined) row.disposalTicketNumber = blank(body.disposalTicketNumber);
    if (body.wasteManifestNumber !== undefined) row.wasteManifestNumber = blank(body.wasteManifestNumber);
    if (body.transferJobNumber !== undefined) row.transferJobNumber = blank(body.transferJobNumber);
    this.copyQty(row, LEED_KEYS, body.leed);
    this.copyQty(row, AGGREGATE_KEYS, body.aggregates);
    row.updatedAt = new Date();
    const saved = await this.hauls.save(row);
    const full = await this.haulQuery({}).andWhere('h.id = :id', { id: saved.id }).getOne();
    return this.haulView(full ?? saved);
  }

  async deleteHaul(id: number) {
    const row = await this.hauls.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Haul not found');
    await this.hauls.delete(id);
    return { id };
  }

  async reportJobs(q: { from?: string; to?: string }) {
    return this.group(await this.listHauls(q), (row) => row.jobNumber ?? '', (row) => ({
      jobNumber: row.jobNumber,
      jobName: row.jobName,
    }));
  }

  /**
   * Cost by job, one page at a time. Every job is still totaled and sorted here (costs come from
   * the rate cards in code); `totals` covers all jobs in the range, `total` is the job count.
   */
  async reportJobsPage(
    q: { from?: string; to?: string },
    opts: { page?: number; pageSize?: number; sortBy?: string; sortDir: 'asc' | 'desc' },
  ) {
    const { rows, totals } = await this.reportJobs(q);
    type Row = (typeof rows)[number];
    const numeric: Record<string, (r: Row) => number> = {
      loads: (r) => r.loads,
      weightTons: (r) => r.weightTons,
      truckingCost: (r) => r.truckingCost,
      disposalCost: (r) => r.disposalCost,
      totalCost: (r) => r.totalCost,
    };
    let sorted = rows; // already Total, high to low
    if (opts.sortBy === 'name') {
      // Same rule as the page: A–Z ignoring case, "Job 2" before "Job 10", blank job numbers last.
      const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
      sorted = [...rows].sort((x, y) => {
        const a = x.jobNumber || '';
        const b = y.jobNumber || '';
        if (!a || !b) return !a === !b ? 0 : !a ? 1 : -1;
        const c = collator.compare(a, b);
        return opts.sortDir === 'desc' ? -c : c;
      });
    } else if (opts.sortBy && numeric[opts.sortBy]) {
      const value = numeric[opts.sortBy];
      sorted = [...rows].sort((x, y) => (opts.sortDir === 'desc' ? value(y) - value(x) : value(x) - value(y)));
    }
    const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50));
    const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const page = Math.min(pages, Math.max(1, opts.page ?? 1));
    return { rows: sorted.slice((page - 1) * pageSize, page * pageSize), totals, total: sorted.length, page, pageSize };
  }

  async reportHaulers(q: { from?: string; to?: string }) {
    return this.group(await this.listHauls(q), (row) => String(row.haulerRateId ?? ''), (row) => ({
      haulerRateId: row.haulerRateId,
      hauler: row.haulerLabel,
    }));
  }

  async reportDestinations(q: { from?: string; to?: string }) {
    return this.group(await this.listHauls(q), (row) => String(row.disposalRateId ?? ''), (row) => ({
      disposalRateId: row.disposalRateId,
      destination: row.disposalLabel,
    }));
  }

  async reportLeed(q: { from?: string; to?: string }) {
    const rows = await this.listHauls(q);
    const byJob = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      const key = row.jobNumber ?? '';
      const bucket = byJob.get(key) ?? {
        jobNumber: row.jobNumber,
        jobName: row.jobName,
        loads: 0,
        ...Object.fromEntries(LEED_KEYS.map((k) => [k, 0])),
        ...Object.fromEntries(AGGREGATE_KEYS.map((k) => [k, 0])),
      };
      bucket.loads = num(bucket.loads) + 1;
      for (const k of LEED_KEYS) bucket[k] = num(bucket[k]) + num(row.leed[k]);
      for (const k of AGGREGATE_KEYS) bucket[k] = num(bucket[k]) + num(row.aggregates[k]);
      byJob.set(key, bucket);
    }
    return [...byJob.values()];
  }

  private group<T extends object>(
    rows: Array<ReturnType<OperationsService['haulView']>>,
    keyOf: (row: ReturnType<OperationsService['haulView']>) => string,
    head: (row: ReturnType<OperationsService['haulView']>) => T,
  ) {
    const buckets = new Map<string, T & { loads: number; weightTons: number; truckingCost: number; disposalCost: number; totalCost: number }>();
    for (const row of rows) {
      const key = keyOf(row);
      const bucket = buckets.get(key) ?? {
        ...head(row),
        loads: 0,
        weightTons: 0,
        truckingCost: 0,
        disposalCost: 0,
        totalCost: 0,
      };
      bucket.loads += 1;
      bucket.weightTons = cents(bucket.weightTons + num(row.weightTons));
      bucket.truckingCost = cents(bucket.truckingCost + row.truckingCost);
      bucket.disposalCost = cents(bucket.disposalCost + row.disposalCost);
      bucket.totalCost = cents(bucket.totalCost + row.totalCost);
      buckets.set(key, bucket);
    }
    const out = [...buckets.values()].sort((a, b) => b.totalCost - a.totalCost);
    const totals = out.reduce(
      (sum, row) => ({
        loads: sum.loads + row.loads,
        weightTons: cents(sum.weightTons + row.weightTons),
        truckingCost: cents(sum.truckingCost + row.truckingCost),
        disposalCost: cents(sum.disposalCost + row.disposalCost),
        totalCost: cents(sum.totalCost + row.totalCost),
      }),
      { loads: 0, weightTons: 0, truckingCost: 0, disposalCost: 0, totalCost: 0 },
    );
    return { rows: out, totals };
  }

  private haulQuery(q: { from?: string; to?: string; jobNumber?: string; haulerRateId?: number; disposalRateId?: number }) {
    const qb = this.hauls
      .createQueryBuilder('h')
      .leftJoinAndSelect('h.job', 'job')
      .leftJoinAndSelect('h.haulerRate', 'hr')
      .leftJoinAndSelect('h.disposalRate', 'dr')
      .orderBy('h.ticketDate', 'DESC')
      .addOrderBy('h.id', 'DESC');
    const from = day(q.from);
    const to = day(q.to);
    if (from) qb.andWhere('h.ticketDate >= :from', { from });
    if (to) qb.andWhere('h.ticketDate <= :to', { to });
    if (q.jobNumber) qb.andWhere('h.jobNumber = :jobNumber', { jobNumber: q.jobNumber });
    if (q.haulerRateId) qb.andWhere('h.haulerRateId = :haulerRateId', { haulerRateId: q.haulerRateId });
    if (q.disposalRateId) qb.andWhere('h.disposalRateId = :disposalRateId', { disposalRateId: q.disposalRateId });
    return qb;
  }

  private haulerView(row: OpsHaulerRate) {
    return {
      id: row.id,
      companyId: row.companyId,
      companyName: row.companyName,
      category: row.category,
      label: haulerLabel(row.companyName, row.category),
      ratePerLoad: num(row.ratePerLoad),
      ratePerHour: num(row.ratePerHour),
      unit: row.unit,
      showUpHours: row.showUpHours == null ? null : num(row.showUpHours),
      address: row.address,
      phone: row.phone,
      contact: row.contact,
      email: row.email,
      coi: row.coi,
      isActive: row.isActive,
    };
  }

  private disposalView(row: OpsDisposalRate) {
    return {
      id: row.id,
      siteId: row.siteId,
      companyName: row.companyName,
      unitLabel: row.unitLabel,
      category: row.category,
      label: disposalLabel(row.companyName, row.unitLabel, row.category),
      costPerLoad: num(row.costPerLoad),
      costPerTon: num(row.costPerTon),
      costPerCy: num(row.costPerCy),
      truckSizeCy: num(row.truckSizeCy),
      tonsIncluded: num(row.tonsIncluded),
      address: row.address,
      phone: row.phone,
      contact: row.contact,
      email: row.email,
      isActive: row.isActive,
    };
  }

  private haulView(row: OpsHaulTicket) {
    const hauler = row.haulerRate ? haulerLabel(row.haulerRate.companyName, row.haulerRate.category) : null;
    const destination = row.disposalRate
      ? disposalLabel(row.disposalRate.companyName, row.disposalRate.unitLabel, row.disposalRate.category)
      : null;
    const trucking = cents(
      truckingCost(row.haulerRate?.ratePerLoad, row.haulerRate?.ratePerHour, row.hours, hauler),
    );
    const disposal = cents(
      disposalCost(
        row.disposalRate?.costPerLoad,
        row.disposalRate?.costPerTon,
        row.disposalRate?.costPerCy,
        row.disposalRate?.truckSizeCy,
        row.disposalRate?.tonsIncluded,
        row.weightTons,
        destination,
      ),
    );
    const leed = {} as Record<string, number | null>;
    for (const key of LEED_KEYS) leed[key] = row[key] == null ? null : num(row[key]);
    const aggregates = {} as Record<string, number | null>;
    for (const key of AGGREGATE_KEYS) aggregates[key] = row[key] == null ? null : num(row[key]);
    return {
      id: row.id,
      ticketDate: day(row.ticketDate),
      jobId: row.jobId,
      jobNumber: row.jobNumber,
      jobName: blank(row.jobName) ?? row.job?.name ?? SENTINEL_JOB,
      haulerRateId: row.haulerRateId,
      haulerLabel: hauler,
      hours: row.hours == null ? null : num(row.hours),
      disposalRateId: row.disposalRateId,
      disposalLabel: destination,
      goelTicketNumber: row.goelTicketNumber,
      haulingTicketNumber: row.haulingTicketNumber,
      disposalTicketNumber: row.disposalTicketNumber,
      wasteManifestNumber: row.wasteManifestNumber,
      transferJobNumber: row.transferJobNumber,
      weightTons: row.weightTons == null ? null : num(row.weightTons),
      leed,
      aggregates,
      truckingCost: trucking,
      disposalCost: disposal,
      totalCost: cents(totalCost(trucking, disposal)),
    };
  }

  private copyQty(row: OpsHaulTicket, keys: readonly QtyKey[], bag: Record<string, unknown> | null | undefined) {
    if (!bag) return;
    for (const key of keys) {
      if (key in bag) row[key] = dec(bag[key]);
    }
  }

  private async companyOrNull(id: number | null | undefined) {
    if (id == null) return null;
    const row = await this.companies.findOne({ where: { id } });
    if (!row) throw new BadRequestException('Unknown company');
    return row.id;
  }

  private async siteOrNull(id: number | null | undefined) {
    if (id == null) return null;
    const row = await this.sites.findOne({ where: { id } });
    if (!row) throw new BadRequestException('Unknown site');
    return row.id;
  }

  private async jobOrThrow(id: number) {
    const row = await this.jobs.findOne({ where: { id } });
    if (!row) throw new BadRequestException('Unknown job');
    return row.id;
  }

  private async haulerOrThrow(id: number) {
    const row = await this.haulers.findOne({ where: { id } });
    if (!row) throw new BadRequestException('Unknown hauler rate');
    return row.id;
  }

  private async disposalOrThrow(id: number) {
    const row = await this.disposal.findOne({ where: { id } });
    if (!row) throw new BadRequestException('Unknown disposal rate');
    return row.id;
  }
}
