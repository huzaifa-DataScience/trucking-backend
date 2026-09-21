import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { DataSource, In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { BidTeam, ConnecteamUser, User, Role, UserStatus } from '../database/entities';
import { isAdminPanelRole, userDisplayName } from '../database/entities/user.entity';
import {
  EXCEL_BID_TEAMS,
  TEAM_CREW_SLOTS,
  crewNameKey,
  emptyCrewSlots,
  excelRosterContacts,
  indexPeopleByName,
  lookupPersonByName,
  mergeBiddingContacts,
  parseCrewJson,
  type BiddingContact,
  type TeamCrewPerson,
  type TeamCrewSlots,
} from '../bidding/process/bid-crew';

const CREW_SELF_TEAM = new Set<Role>([
  Role.Captain,
  Role.AssistantEstimator,
  Role.User,
  Role.BidClerk,
]);

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(BidTeam)
    private readonly teamRepo: Repository<BidTeam>,
    @InjectRepository(ConnecteamUser)
    private readonly connecteamUsers: Repository<ConnecteamUser>,
  ) {}

  async onModuleInit(): Promise<void> {
    const full = join(process.cwd(), 'scripts/sql', 'add-bid-team-crew-json.sql');
    if (existsSync(full)) {
      try {
        await this.dataSource.query(readFileSync(full, 'utf8'));
      } catch (e: unknown) {
        this.logger.warn(`Bid_Teams.CrewJson DDL skipped: ${e instanceof Error ? e.message : e}`);
      }
    }
    try {
      await this.linkSeededTeamsToSystem();
    } catch (e: unknown) {
      this.logger.warn(`Bid crew bootstrap skipped: ${e instanceof Error ? e.message : e}`);
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email: email.trim().toLowerCase() } });
  }

  async findById(id: number): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async create(data: { 
    email: string; 
    password: string; 
    role?: Role;
    status?: UserStatus;
  }): Promise<User> {
    const email = data.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = this.userRepo.create({
      email,
      passwordHash,
      role: data.role ?? Role.User,
      status: data.status ?? UserStatus.Pending, // New signups default to pending
    });
    return this.userRepo.save(user);
  }

  async validatePassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  async updateLastLogin(userId: number): Promise<void> {
    await this.userRepo.update(userId, { lastLoginAt: new Date() });
  }

  async setAvatarPath(userId: number, avatarPath: string | null): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new Error(`User ${userId} not found`);
    user.avatarPath = avatarPath;
    return this.userRepo.save(user);
  }

  /** Self-service name edit (Account page) — same trim/null rule as the admin panel's. */
  async setName(userId: number, updates: { firstName?: string | null; lastName?: string | null }): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new Error(`User ${userId} not found`);
    if (updates.firstName !== undefined) user.firstName = updates.firstName?.trim() || null;
    if (updates.lastName !== undefined) user.lastName = updates.lastName?.trim() || null;
    return this.userRepo.save(user);
  }

  /** Captain / AE / clerk pick their Bid_Teams row. Login `user.teamId`. */
  async setBidTeamId(userId: number, teamId: number | null, opts?: { self?: boolean }): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    if (opts?.self && !CREW_SELF_TEAM.has(user.role)) {
      throw new BadRequestException('Only captain / estimator / bid clerk can pick a team');
    }
    if (teamId != null) {
      const team = await this.teamRepo.findOne({ where: { id: teamId, isActive: true } });
      if (!team) throw new BadRequestException(`Team ${teamId} not found`);
    }
    const prev = user.bidTeamId ?? null;
    user.bidTeamId = teamId;
    const saved = await this.userRepo.save(user);
    if (saved.role === Role.Captain) {
      await this.syncTeamCaptainNames([prev, teamId]);
    }
    return saved;
  }

  /** Keep Bid_Teams.Captain in sync with login captains on that crew. */
  private async syncTeamCaptainNames(teamIds: Array<number | null>): Promise<void> {
    const ids = [...new Set(teamIds.filter((id): id is number => id != null))];
    if (!ids.length) return;
    const teams = await this.teamRepo.find({ where: { id: In(ids) } });
    const captains = await this.userRepo.find({
      where: { role: Role.Captain, status: UserStatus.Active, bidTeamId: In(ids) },
    });
    const namesByTeam = new Map<number, string[]>();
    for (const c of captains) {
      if (c.bidTeamId == null) continue;
      const list = namesByTeam.get(c.bidTeamId) ?? [];
      list.push(userDisplayName(c));
      namesByTeam.set(c.bidTeamId, list);
    }
    for (const team of teams) {
      const names = namesByTeam.get(team.id);
      if (!names?.length) continue;
      team.captain = names.join(', ');
      await this.teamRepo.save(team);
    }
  }

  async getMyCrew(user: User): Promise<{
    teamId: number | null;
    teamName: string | null;
    contacts: string;
    people: BiddingContact[];
    slots: TeamCrewSlots;
  }> {
    const captain = this.personFromApp(user);
    const contacts = 'GET /lookups/bidding/contacts';
    const people = await this.listCrewContacts();
    if (user.bidTeamId == null) {
      return { teamId: null, teamName: null, contacts, people, slots: emptyCrewSlots(captain) };
    }
    const team = await this.teamRepo.findOne({ where: { id: user.bidTeamId } });
    if (!team) return { teamId: null, teamName: null, contacts, people, slots: emptyCrewSlots(captain) };
    const slots = parseCrewJson(team.crewJson, captain);
    this.fillSlotsFromNameColumns(team, slots);
    return { teamId: team.id, teamName: team.teamName, contacts, people, slots };
  }

  /** Settings / assignment people picker — AEs + clerks + captains + Connecteam + Excel roster. */
  async listCrewContacts(): Promise<BiddingContact[]> {
    const [ctRows, appUsers, teams] = await Promise.all([
      this.connecteamUsers.find({ where: { isArchived: false } }),
      this.userRepo.find({
        where: { status: UserStatus.Active, role: In([...CREW_SELF_TEAM]) },
      }),
      this.teamRepo.find({ where: { isActive: true } }),
    ]);
    const roster: Array<{ name: string; role: string | null }> = excelRosterContacts();
    for (const team of teams) {
      if (team.captain) roster.push({ name: team.captain, role: 'captain' });
      if (team.bidClerk) roster.push({ name: team.bidClerk, role: 'bid_clerk' });
      for (const slot of TEAM_CREW_SLOTS) {
        if (slot === 'bidClerk' || !team[slot]) continue;
        roster.push({ name: team[slot] as string, role: 'assistant_estimator' });
      }
    }
    return mergeBiddingContacts(
      appUsers.map((u) => ({ ...this.personFromApp(u), role: u.role })),
      ctRows.map((c) => this.personFromConnecteam(c)),
      roster,
    );
  }

  /** Captain builds their crew from Connecteam / App contacts. Creates their Bid_Teams row if needed. */
  async saveMyCrew(
    user: User,
    picks: Record<string, { connecteamUserId?: number | null; appUserId?: number | null; name?: string | null } | null>,
  ): Promise<{ user: User; team: Awaited<ReturnType<UsersService['getMyCrew']>> }> {
    if (user.role !== Role.Captain) {
      throw new BadRequestException('Only a captain can set their crew');
    }
    const unknown = Object.keys(picks ?? {}).filter(
      (k) => k !== 'captain' && !(TEAM_CREW_SLOTS as readonly string[]).includes(k),
    );
    if (unknown.length) throw new BadRequestException(`Unknown slots: ${unknown.join(', ')}`);

    let team: BidTeam | null =
      user.bidTeamId != null ? await this.teamRepo.findOne({ where: { id: user.bidTeamId } }) : null;
    if (!team) {
      const max = await this.teamRepo
        .createQueryBuilder('t')
        .select('MAX(t.sortOrder)', 'm')
        .getRawOne<{ m: number | null }>();
      team = await this.teamRepo.save(
        this.teamRepo.create({
          teamName: userDisplayName(user),
          captain: userDisplayName(user),
          isActive: true,
          sortOrder: (max?.m ?? 0) + 1,
        }),
      );
      user.bidTeamId = team.id;
      user = await this.userRepo.save(user);
    }

    const prevIds = this.appIdsFromSlots(parseCrewJson(team.crewJson, null));
    const slots = emptyCrewSlots(this.personFromApp(user));
    for (const slot of TEAM_CREW_SLOTS) {
      slots[slot] = await this.resolvePick(picks?.[slot] ?? null);
      team[slot] = slots[slot]?.name ?? null;
    }
    team.captain = userDisplayName(user);
    team.crewJson = JSON.stringify(slots);
    await this.teamRepo.save(team);

    const nextIds = this.appIdsFromSlots(slots);
    const drop = [...prevIds].filter((id) => !nextIds.has(id) && id !== user.id);
    if (drop.length) {
      await this.userRepo
        .createQueryBuilder()
        .update(User)
        .set({ bidTeamId: null })
        .where('id IN (:...ids) AND bidTeamId = :teamId', { ids: drop, teamId: team.id })
        .execute();
    }
    for (const id of nextIds) {
      if (id === user.id) continue;
      await this.userRepo.update(id, { bidTeamId: team.id });
    }

    return { user, team: await this.getMyCrew(user) };
  }

  private appIdsFromSlots(slots: TeamCrewSlots): Set<number> {
    const ids = new Set<number>();
    for (const slot of ['captain', ...TEAM_CREW_SLOTS] as const) {
      const id = slots[slot]?.appUserId;
      if (id != null) ids.add(id);
    }
    return ids;
  }

  private fillSlotsFromNameColumns(team: BidTeam, slots: TeamCrewSlots): void {
    if (!slots.captain && team.captain) {
      slots.captain = {
        appUserId: null,
        connecteamUserId: null,
        name: team.captain,
        email: null,
        firstName: null,
        lastName: null,
      };
    }
    for (const slot of TEAM_CREW_SLOTS) {
      if (slots[slot] || !team[slot]) continue;
      slots[slot] = {
        appUserId: null,
        connecteamUserId: null,
        name: team[slot] as string,
        email: null,
        firstName: null,
        lastName: null,
      };
    }
  }

  /** Excel Team_list → Bid_Teams rows (idempotent). Then match names to Connecteam / App_Users. */
  private async linkSeededTeamsToSystem(): Promise<void> {
    await this.ensureExcelTeams();
    const teams = await this.teamRepo.find();
    if (!teams.length) return;

    const ctRows = await this.connecteamUsers.find({ where: { isArchived: false } });
    const ctByName = indexPeopleByName(
      ctRows.map((c) => ({
        ...c,
        name:
          [c.firstName, c.lastName].map((s) => String(s ?? '').trim()).filter(Boolean).join(' ') ||
          c.email,
      })),
    );

    const touched = new Set<number>();
    for (const team of teams) {
      const slots = parseCrewJson(team.crewJson, null);
      this.fillSlotsFromNameColumns(team, slots);
      let dirty = false;

      const capLabel = slots.captain?.name || team.captain || team.teamName;
      if (!this.slotLinked(slots.captain) && capLabel) {
        const ct = lookupPersonByName(ctByName, capLabel);
        if (ct) {
          const person = this.personFromConnecteam(ct);
          const app = await this.linkAppUserToTeam(ct, team.id, true);
          if (app) person.appUserId = app.id;
          slots.captain = person;
          team.captain = person.name;
          dirty = true;
        }
      } else if (slots.captain?.appUserId) {
        await this.setBidTeamIfCrew(slots.captain.appUserId, team.id, true);
      }

      for (const slot of TEAM_CREW_SLOTS) {
        const current = slots[slot];
        if (this.slotLinked(current)) {
          if (current?.appUserId) await this.setBidTeamIfCrew(current.appUserId, team.id, false);
          continue;
        }
        const label = current?.name || (team[slot] as string | null);
        if (!label) continue;
        const ct = lookupPersonByName(ctByName, label);
        if (!ct) continue;
        const person = this.personFromConnecteam(ct);
        const app = await this.linkAppUserToTeam(ct, team.id, false);
        if (app) person.appUserId = app.id;
        slots[slot] = person;
        team[slot] = person.name;
        dirty = true;
      }

      if (dirty) {
        team.crewJson = JSON.stringify(slots);
        await this.teamRepo.save(team);
        touched.add(team.id);
      }
    }
    if (touched.size) {
      await this.syncTeamCaptainNames([...touched]);
      this.logger.log(`Linked Excel crew names on ${touched.size} Bid_Teams row(s) to Connecteam / App_Users`);
    }
  }

  private slotLinked(person: TeamCrewPerson | null | undefined): boolean {
    return person != null && (person.connecteamUserId != null || person.appUserId != null);
  }

  private async ensureExcelTeams(): Promise<void> {
    const existing = await this.teamRepo.find();
    const byName = new Map(existing.map((t) => [crewNameKey(t.teamName), t]));
    const maxSort = existing.reduce((m, t) => Math.max(m, t.sortOrder ?? 0), 0);
    let nextSort = maxSort;
    for (const seed of EXCEL_BID_TEAMS) {
      let team = byName.get(crewNameKey(seed.teamName));
      if (!team) {
        nextSort += 1;
        team = await this.teamRepo.save(
          this.teamRepo.create({
            teamName: seed.teamName,
            captain: seed.captain,
            bidClerk: seed.bidClerk,
            duct1: seed.duct1,
            duct2: seed.duct2,
            hydronic1: seed.hydronic1,
            hydronic2: seed.hydronic2,
            plumbing1: seed.plumbing1,
            plumbing2: seed.plumbing2,
            isActive: true,
            sortOrder: nextSort,
          }),
        );
        byName.set(crewNameKey(seed.teamName), team);
        continue;
      }
      let dirty = false;
      if (!team.captain && seed.captain) {
        team.captain = seed.captain;
        dirty = true;
      }
      for (const slot of TEAM_CREW_SLOTS) {
        if (!team[slot] && seed[slot]) {
          team[slot] = seed[slot];
          dirty = true;
        }
      }
      if (dirty) await this.teamRepo.save(team);
    }
  }

  private async linkAppUserToTeam(
    ct: ConnecteamUser,
    teamId: number,
    asCaptain: boolean,
  ): Promise<User | null> {
    let app: User | null = ct.appUserId ? await this.findById(ct.appUserId) : null;
    if (!app && ct.email) app = await this.findByEmail(ct.email);
    if (!app) return null;
    if (isAdminPanelRole(app.role)) return app;
    app.bidTeamId = teamId;
    if (asCaptain && CREW_SELF_TEAM.has(app.role)) app.role = Role.Captain;
    if (!app.firstName && ct.firstName) app.firstName = ct.firstName;
    if (!app.lastName && ct.lastName) app.lastName = ct.lastName;
    const saved = await this.userRepo.save(app);
    if (ct.appUserId !== saved.id) {
      ct.appUserId = saved.id;
      await this.connecteamUsers.save(ct);
    }
    return saved;
  }

  private async setBidTeamIfCrew(userId: number, teamId: number, asCaptain: boolean): Promise<void> {
    const app = await this.findById(userId);
    if (!app || isAdminPanelRole(app.role)) return;
    let dirty = false;
    if (app.bidTeamId !== teamId) {
      app.bidTeamId = teamId;
      dirty = true;
    }
    if (asCaptain && CREW_SELF_TEAM.has(app.role) && app.role !== Role.Captain) {
      app.role = Role.Captain;
      dirty = true;
    }
    if (dirty) await this.userRepo.save(app);
  }

  private async resolvePick(
    pick: { connecteamUserId?: number | null; appUserId?: number | null; name?: string | null } | null,
  ): Promise<TeamCrewPerson | null> {
    if (!pick) return null;
    if (pick.connecteamUserId != null) {
      const c = await this.connecteamUsers.findOne({ where: { userId: pick.connecteamUserId } });
      if (!c) throw new BadRequestException(`Connecteam user ${pick.connecteamUserId} not found`);
      return this.personFromConnecteam(c);
    }
    if (pick.appUserId != null) {
      const u = await this.findById(pick.appUserId);
      if (!u) throw new BadRequestException(`User ${pick.appUserId} not found`);
      const linked = await this.connecteamUsers.findOne({ where: { appUserId: u.id } });
      return linked ? this.personFromConnecteam(linked) : this.personFromApp(u);
    }
    const name = String(pick.name ?? '').trim();
    if (!name) return null;
    const ctRows = await this.connecteamUsers.find({ where: { isArchived: false } });
    const ct = lookupPersonByName(
      indexPeopleByName(
        ctRows.map((c) => ({
          ...c,
          name:
            [c.firstName, c.lastName].map((s) => String(s ?? '').trim()).filter(Boolean).join(' ') ||
            c.email,
        })),
      ),
      name,
    );
    if (ct) return this.personFromConnecteam(ct);
    const appUsers = await this.userRepo.find({
      where: { status: UserStatus.Active, role: In([...CREW_SELF_TEAM]) },
    });
    const app = lookupPersonByName(
      indexPeopleByName(appUsers.map((u) => ({ ...u, name: userDisplayName(u) }))),
      name,
    );
    if (app) return this.personFromApp(app);
    return {
      appUserId: null,
      connecteamUserId: null,
      name,
      email: null,
      firstName: null,
      lastName: null,
    };
  }

  private personFromApp(u: User): TeamCrewPerson {
    return {
      appUserId: u.id,
      connecteamUserId: null,
      name: userDisplayName(u),
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
    };
  }

  private personFromConnecteam(c: ConnecteamUser): TeamCrewPerson {
    const parts = [c.firstName, c.lastName].map((s) => String(s ?? '').trim()).filter(Boolean);
    return {
      appUserId: c.appUserId ?? null,
      connecteamUserId: c.userId,
      name: parts.join(' ') || c.email || `Connecteam ${c.userId}`,
      email: c.email,
      firstName: c.firstName,
      lastName: c.lastName,
    };
  }
}
