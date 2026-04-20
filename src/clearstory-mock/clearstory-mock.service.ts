import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { ClearstoryCorDto, ClearstoryProjectDto } from './dto/clearstory.dto';

type MockDb = {
  projects: ClearstoryProjectDto[];
  corsByProjectId: Record<
    string,
    ClearstoryCorDto[]
  >;
};

const DEFAULT_FIXTURE_PATH = join(process.cwd(), 'docs', 'clearstory_mock_fixture.json');

@Injectable()
export class ClearstoryMockService {
  private cached: MockDb | null = null;

  private load(): MockDb {
    if (this.cached) return this.cached;
    const path = process.env.CLEARSTORY_MOCK_FILE?.trim() || DEFAULT_FIXTURE_PATH;
    if (!existsSync(path)) {
      throw new Error(
        `Clearstory mock fixture not found at ${path}. Set CLEARSTORY_MOCK_FILE or add docs/clearstory_mock_fixture.json.`,
      );
    }
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as MockDb;
    this.cached = parsed;
    return parsed;
  }

  listProjects(): MockDb['projects'] {
    return this.load().projects;
  }

  getProject(id: number) {
    return this.load().projects.find((p) => p.id === id) ?? null;
  }

  listCors(projectId: number) {
    const cors = this.load().corsByProjectId[String(projectId)] ?? [];
    return cors;
  }
}

