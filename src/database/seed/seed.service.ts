import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  Driver,
  ExternalSite,
  Hauler,
  Job,
  Material,
  OurEntity,
  Photo,
  Ticket,
  TruckType,
} from '../entities';
import { Role, UserStatus } from '../entities';
import { UsersService } from '../../users/users.service';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'Admin123!';

@Injectable()
export class SeedService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
    @InjectRepository(OurEntity)
    private readonly entityRepo: Repository<OurEntity>,
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
    @InjectRepository(Material)
    private readonly materialRepo: Repository<Material>,
    @InjectRepository(Hauler)
    private readonly haulerRepo: Repository<Hauler>,
    @InjectRepository(ExternalSite)
    private readonly siteRepo: Repository<ExternalSite>,
    @InjectRepository(TruckType)
    private readonly truckTypeRepo: Repository<TruckType>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(Ticket)
    private readonly ticketRepo: Repository<Ticket>,
    @InjectRepository(Photo)
    private readonly photoRepo: Repository<Photo>,
  ) {}

  async seed() {
    console.log('🌱 Starting comprehensive database seed...');

    await this.ensureUsersTable();
    await this.ensureAdminUser();

    // Clear existing data
    await this.clearData();

    // Seed reference tables (order matters due to foreign keys)
    const entities = await this.seedOurEntities();
    const jobs = await this.seedJobs(entities);
    const materials = await this.seedMaterials();
    const haulers = await this.seedHaulers();
    const sites = await this.seedExternalSites();
    const truckTypes = await this.seedTruckTypes();
    const drivers = await this.seedDrivers();

    // Seed tickets with photos
    await this.seedTickets(jobs, materials, haulers, sites, truckTypes, drivers);

    console.log('✅ Database seed completed!');
  }

  private async ensureUsersTable(): Promise<void> {
    console.log('👤 Ensuring App_Users table exists...');
    await this.dataSource.query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'App_Users')
      BEGIN
        CREATE TABLE dbo.App_Users (
          Id int IDENTITY(1,1) NOT NULL PRIMARY KEY,
          Email nvarchar(255) NOT NULL UNIQUE,
          PasswordHash nvarchar(255) NOT NULL,
          Role nvarchar(50) NOT NULL DEFAULT 'user',
          Status nvarchar(50) NOT NULL DEFAULT 'pending',
          CreatedAt datetime2 NOT NULL DEFAULT GETUTCDATE(),
          LastLoginAt datetime2 NULL
        );
      END
    `);
  }

  private async ensureAdminUser(): Promise<void> {
    const existing = await this.usersService.findByEmail(ADMIN_EMAIL);
    if (existing) {
      console.log('👤 Admin user already exists:', ADMIN_EMAIL);
      // Ensure admin is active (in case status field was added later)
      if (existing.status !== UserStatus.Active) {
        existing.status = UserStatus.Active;
        await this.usersService['userRepo'].save(existing);
        console.log('👤 Updated admin user status to active');
      }
      return;
    }
    await this.usersService.create({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: Role.Admin,
      status: UserStatus.Active, // Admin is active by default
    });
    console.log('👤 Created admin user:', ADMIN_EMAIL, '(password: ' + ADMIN_PASSWORD + ')');
  }

  private async clearData() {
    console.log('🗑️  Clearing existing data...');
    // Use query builder to delete all records (works even if tables are empty)
    await this.photoRepo.createQueryBuilder().delete().execute();
    await this.ticketRepo.createQueryBuilder().delete().execute();
    await this.driverRepo.createQueryBuilder().delete().execute();
    await this.truckTypeRepo.createQueryBuilder().delete().execute();
    await this.siteRepo.createQueryBuilder().delete().execute();
    await this.haulerRepo.createQueryBuilder().delete().execute();
    await this.materialRepo.createQueryBuilder().delete().execute();
    await this.jobRepo.createQueryBuilder().delete().execute();
    await this.entityRepo.createQueryBuilder().delete().execute();
  }

  private async seedOurEntities(): Promise<OurEntity[]> {
    console.log('🏢 Seeding Our Entities...');
    const entities = [
      { name: 'Company A' },
      { name: 'Company B' },
      { name: 'Company C' },
    ];
    return this.entityRepo.save(entities);
  }

  private async seedJobs(entities: OurEntity[]): Promise<Job[]> {
    console.log('📋 Seeding Jobs...');
    const jobs = [
      {
        jobNumber: 'JOB-001',
        name: 'Downtown Construction Phase 1',
        entityId: entities[0].id,
        jobAddress: '123 Main St',
        city: 'New York',
        isActive: true,
      },
      {
        jobNumber: 'JOB-002',
        name: 'Highway Expansion Project',
        entityId: entities[0].id,
        jobAddress: '456 Highway Blvd',
        city: 'Los Angeles',
        isActive: true,
      },
      {
        jobNumber: 'JOB-003',
        name: 'Residential Complex A',
        entityId: entities[1].id,
        jobAddress: '789 Oak Avenue',
        city: 'Chicago',
        isActive: true,
      },
      {
        jobNumber: 'JOB-004',
        name: 'Industrial Park Development',
        entityId: entities[0].id,
        jobAddress: '321 Industrial Way',
        city: 'Houston',
        isActive: true,
      },
      {
        jobNumber: 'JOB-005',
        name: 'Shopping Center Renovation',
        entityId: entities[1].id,
        jobAddress: '654 Commerce Dr',
        city: 'Phoenix',
        isActive: true,
      },
      {
        jobNumber: 'JOB-006',
        name: 'Bridge Reconstruction',
        entityId: entities[0].id,
        jobAddress: '987 River Road',
        city: 'Philadelphia',
        isActive: true,
      },
      {
        jobNumber: 'JOB-007',
        name: 'Office Building Site Prep',
        entityId: entities[1].id,
        jobAddress: '147 Business Park',
        city: 'San Antonio',
        isActive: true,
      },
      {
        jobNumber: 'JOB-008',
        name: 'Warehouse Foundation',
        entityId: entities[2].id,
        jobAddress: '258 Logistics Lane',
        city: 'San Diego',
        isActive: true,
      },
    ];
    return this.jobRepo.save(jobs);
  }

  private async seedMaterials(): Promise<Material[]> {
    console.log('📦 Seeding Materials...');
    const materials = [
      { name: 'Concrete', parentMaterialId: null },
      { name: 'Ready-Mix Concrete', parentMaterialId: null },
      { name: 'Gravel', parentMaterialId: null },
      { name: 'Crushed Stone', parentMaterialId: null },
      { name: 'Asphalt', parentMaterialId: null },
      { name: 'Hot Mix Asphalt', parentMaterialId: null },
      { name: 'Sand', parentMaterialId: null },
      { name: 'Fill Dirt', parentMaterialId: null },
      { name: 'Topsoil', parentMaterialId: null },
      { name: 'Asbestos', parentMaterialId: null },
      { name: 'Scrap Metal', parentMaterialId: null },
      { name: 'Recycled Concrete', parentMaterialId: null },
      { name: 'Demolition Debris', parentMaterialId: null },
    ];
    return this.materialRepo.save(materials);
  }

  private async seedHaulers(): Promise<Hauler[]> {
    console.log('🚛 Seeding Haulers...');
    const haulers = [
      {
        companyName: 'ABC Trucking Co',
        address: '100 Transport Ave',
        city: 'Dallas',
        isActive: true,
      },
      {
        companyName: 'XYZ Logistics',
        address: '200 Freight Blvd',
        city: 'Atlanta',
        isActive: true,
      },
      {
        companyName: 'Fast Haul Inc',
        address: '300 Speedway Dr',
        city: 'Miami',
        isActive: true,
      },
      {
        companyName: 'Reliable Transport',
        address: '400 Delivery St',
        city: 'Seattle',
        isActive: true,
      },
      {
        companyName: 'Premier Hauling',
        address: '500 Carrier Way',
        city: 'Denver',
        isActive: true,
      },
      {
        companyName: 'Metro Trucking',
        address: '600 Urban Ave',
        city: 'Boston',
        isActive: true,
      },
    ];
    return this.haulerRepo.save(haulers);
  }

  private async seedExternalSites(): Promise<ExternalSite[]> {
    console.log('📍 Seeding External Sites...');
    const sites = [
      {
        name: 'Concrete Plant A',
        siteType: 'Supplier',
        address: '700 Concrete Rd',
        city: 'Austin',
      },
      {
        name: 'Concrete Plant B',
        siteType: 'Supplier',
        address: '800 Mix Ave',
        city: 'Portland',
      },
      {
        name: 'Disposal Site North',
        siteType: 'Disposal',
        address: '900 Waste Way',
        city: 'Detroit',
      },
      {
        name: 'Disposal Site South',
        siteType: 'Disposal',
        address: '1000 Dump Rd',
        city: 'Memphis',
      },
      {
        name: 'Gravel Quarry',
        siteType: 'Supplier',
        address: '1100 Quarry Ln',
        city: 'Nashville',
      },
      {
        name: 'Sand Pit',
        siteType: 'Supplier',
        address: '1200 Sand Dr',
        city: 'Las Vegas',
      },
      {
        name: 'Landfill Central',
        siteType: 'Disposal',
        address: '1300 Landfill Blvd',
        city: 'Kansas City',
      },
      {
        name: 'Recycling Center',
        siteType: 'Disposal',
        address: '1400 Recycle Way',
        city: 'Minneapolis',
      },
      {
        name: 'Asphalt Plant',
        siteType: 'Supplier',
        address: '1500 Asphalt Ave',
        city: 'Tampa',
      },
      {
        name: 'Transfer Station',
        siteType: 'Disposal',
        address: '1600 Transfer St',
        city: 'Baltimore',
      },
    ];
    return this.siteRepo.save(sites);
  }

  private async seedTruckTypes(): Promise<TruckType[]> {
    console.log('🚚 Seeding Truck Types...');
    const types = [
      { name: 'Tri-Axle' },
      { name: 'Quad-Axle' },
      { name: 'Trailer' },
      { name: 'Semi-Trailer' },
      { name: 'Dump Truck' },
      { name: 'Flatbed' },
      { name: 'End Dump' },
      { name: 'Side Dump' },
      { name: 'Live Floor' },
      { name: 'Roll-Off' },
    ];
    return this.truckTypeRepo.save(types);
  }

  private async seedDrivers(): Promise<Driver[]> {
    console.log('👤 Seeding Drivers...');
    const drivers = [
      { driverName: 'John Smith', phone: '555-0101', email: 'john.smith@example.com' },
      { driverName: 'Mike Johnson', phone: '555-0102', email: 'mike.johnson@example.com' },
      { driverName: 'David Brown', phone: '555-0103', email: 'david.brown@example.com' },
      { driverName: 'Robert Wilson', phone: '555-0104', email: 'robert.wilson@example.com' },
      { driverName: 'James Davis', phone: '555-0105', email: 'james.davis@example.com' },
      { driverName: 'William Miller', phone: '555-0106', email: 'william.miller@example.com' },
      { driverName: 'Richard Garcia', phone: '555-0107', email: 'richard.garcia@example.com' },
      { driverName: 'Joseph Martinez', phone: '555-0108', email: 'joseph.martinez@example.com' },
      { driverName: 'Thomas Anderson', phone: '555-0109', email: 'thomas.anderson@example.com' },
      { driverName: 'Charles Taylor', phone: '555-0110', email: 'charles.taylor@example.com' },
      { driverName: 'Christopher Thomas', phone: '555-0111', email: 'christopher.thomas@example.com' },
      { driverName: 'Daniel Jackson', phone: '555-0112', email: 'daniel.jackson@example.com' },
    ];
    return this.driverRepo.save(drivers);
  }

  private async seedTickets(
    jobs: Job[],
    materials: Material[],
    haulers: Hauler[],
    sites: ExternalSite[],
    truckTypes: TruckType[],
    drivers: Driver[],
  ) {
    console.log('🎫 Seeding Tickets...');

    const tickets: Partial<Ticket>[] = [];
    const now = new Date();
    const supervisors = ['Supervisor A', 'Supervisor B', 'Supervisor C', 'Supervisor D', 'Supervisor E'];

    // Generate 500 tickets for comprehensive testing
    for (let i = 0; i < 500; i++) {
      // Ticket dates spread over last 90 days
      const daysAgo = Math.floor(Math.random() * 90);
      const ticketDate = new Date(now);
      ticketDate.setDate(ticketDate.getDate() - daysAgo);
      
      // Set random time of day (6 AM to 6 PM)
      ticketDate.setHours(6 + Math.floor(Math.random() * 12));
      ticketDate.setMinutes(Math.floor(Math.random() * 60));

      const createdAt = new Date(ticketDate);
      // 30% of tickets are late submissions (>24h after ticket date)
      if (Math.random() > 0.7) {
        const hoursLate = 25 + Math.floor(Math.random() * 72); // 25-96 hours late
        createdAt.setHours(createdAt.getHours() + hoursLate);
      } else {
        // Same day, within 8 hours
        createdAt.setHours(createdAt.getHours() + Math.floor(Math.random() * 8));
      }

      const direction = Math.random() > 0.5 ? 'Import' : 'Export';
      const hasPhysicalTicket = Math.random() > 0.25; // 75% have physical tickets
      let haulerTicketNumber: string | null = null;
      
      if (hasPhysicalTicket) {
        // 15% missing even though hasPhysicalTicket is true
        if (Math.random() > 0.15) {
          haulerTicketNumber = `HT-${String(10000 + i).padStart(6, '0')}`;
        }
      }

      // Select related entities
      const job = jobs[Math.floor(Math.random() * jobs.length)];
      const material = materials[Math.floor(Math.random() * materials.length)];
      const hauler = haulers[Math.floor(Math.random() * haulers.length)];
      
      // For imports, prefer supplier sites; for exports, prefer disposal sites
      const relevantSites = sites.filter(s => 
        direction === 'Import' 
          ? s.siteType === 'Supplier'
          : s.siteType === 'Disposal'
      );
      const site = relevantSites.length > 0
        ? relevantSites[Math.floor(Math.random() * relevantSites.length)]
        : sites[Math.floor(Math.random() * sites.length)];

      const truckType = truckTypes[Math.floor(Math.random() * truckTypes.length)];
      const driver = drivers[Math.floor(Math.random() * drivers.length)];

      // Truck numbers - some trucks appear multiple times (for efficiency outlier testing)
      const truckNum = Math.floor(Math.random() * 20) + 1; // 20 different trucks
      const truckNumber = `TRUCK-${String(truckNum).padStart(3, '0')}`;

      tickets.push({
        goFormzId: `GF-${String(50000 + i).padStart(6, '0')}`,
        ticketNumber: `TICKET-${String(i + 1).padStart(5, '0')}`,
        ticketDate,
        createdAt,
        jobId: job.id,
        direction: direction as 'Import' | 'Export',
        externalSiteId: site.id,
        haulerId: hauler.id,
        materialId: material.id,
        truckNumber,
        truckTypeId: truckType.id,
        driverId: driver.id,
        hasPhysicalTicket,
        physicalTicketNumber: haulerTicketNumber,
        signedBy: supervisors[Math.floor(Math.random() * supervisors.length)],
      });
    }

    // Save in batches for better performance
    const batchSize = 100;
    const savedTickets: Ticket[] = [];
    
    for (let i = 0; i < tickets.length; i += batchSize) {
      const batch = tickets.slice(i, i + batchSize);
      const saved = await this.ticketRepo.save(batch);
      savedTickets.push(...saved);
      console.log(`  Saved batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(tickets.length / batchSize)}`);
    }

    // Seed photos for tickets
    console.log('📸 Seeding Photos...');
    const photoTypes = ['Ticket', 'Truck1', 'Truck2', 'Asbestos', 'Scrap'];
    const photos: Partial<Photo>[] = [];

    // 70% of tickets get photos
    const ticketsWithPhotos = savedTickets.slice(0, Math.floor(savedTickets.length * 0.7));
    
    for (const ticket of ticketsWithPhotos) {
      // Each ticket gets 1-5 photos (random selection)
      const numPhotos = Math.floor(Math.random() * 5) + 1;
      const selectedTypes = photoTypes
        .sort(() => Math.random() - 0.5)
        .slice(0, numPhotos);

      for (const type of selectedTypes) {
        photos.push({
          ticketId: ticket.id,
          photoType: type,
          url: `https://example.com/photos/${ticket.ticketNumber}/${type.toLowerCase()}.jpg`,
          uploadedAt: new Date(ticket.createdAt),
        });
      }
    }

    // Save photos in batches
    const photoBatchSize = 200;
    for (let i = 0; i < photos.length; i += photoBatchSize) {
      const batch = photos.slice(i, i + photoBatchSize);
      await this.photoRepo.save(batch);
    }

    console.log(`✅ Created ${savedTickets.length} tickets with ${photos.length} photos`);
    console.log(`   - Jobs: ${jobs.length}`);
    console.log(`   - Materials: ${materials.length}`);
    console.log(`   - Haulers: ${haulers.length}`);
    console.log(`   - Sites: ${sites.length}`);
    console.log(`   - Truck Types: ${truckTypes.length}`);
    console.log(`   - Drivers: ${drivers.length}`);
  }
}
