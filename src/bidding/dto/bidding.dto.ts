import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { BidSystemKey } from '../bidding-calc/types';

const SYSTEM_KEYS: BidSystemKey[] = [
  'duct1',
  'duct2',
  'hydronic1',
  'hydronic2',
  'plumbing1',
  'plumbing2',
  'vrf',
  'equipment',
];

/**
 * `baseBid` is stored as-is (passthrough JSON). The backend no longer computes
 * from these fields, so we accept any key the client sends (Excel input parity)
 * rather than stripping unknown ones via a strict nested DTO. Known/documented
 * fields live in `docs/BIDDING_FRONTEND_API.md` §4.
 */
export type BaseBidInput = Record<string, unknown>;

/**
 * `computed` is the client-calculated snapshot (Excel engine in the browser).
 * Stored opaquely and returned verbatim — no server-side schema enforcement so
 * the frontend can add keys (`systemsComputed`, `laborBuildUp`, ...) freely.
 */
export type ComputedSnapshot = Record<string, unknown>;

/**
 * Who the bid is for (client / GC / mechanical contractor). Passthrough JSON —
 * documented fields in `docs/BIDDING_FRONTEND_API.md` §3.5.
 */
export type CompanyInfoInput = Record<string, unknown>;

export class BidSystemInputDto {
  @IsIn(SYSTEM_KEYS) key!: BidSystemKey;
  @IsOptional() @IsBoolean() used?: boolean;
  @IsOptional() @IsNumber() mikeEstimateNumber?: number;
  @IsOptional() @IsNumber() materials?: number;
  @IsOptional() @IsNumber() laborHours?: number;
  @IsOptional() @IsNumber() mikeTotalPrice?: number;
  @IsOptional() @IsNumber() quantity?: number;
}

export class CreateBidDto {
  @IsInt() ourEntityId!: number;
  @IsOptional() @IsInt() jobId?: number;
  @IsString() @MaxLength(64) estimateNumber!: string;
  @IsOptional() @IsString() @MaxLength(500) bidName?: string;
  @IsOptional() @IsString() bidDate?: string;
  @IsOptional() @IsString() submitDate?: string;
  @IsOptional() @IsNumber() timeEstimate?: number;

  @IsOptional() @IsObject() baseBid?: BaseBidInput;

  @IsOptional() @IsObject() companyInfo?: CompanyInfoInput;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BidSystemInputDto)
  systems?: BidSystemInputDto[];

  @IsOptional() @IsObject() computed?: ComputedSnapshot;
}

export class PatchBidDto {
  @IsOptional() @IsInt() ourEntityId?: number;
  @IsOptional() @IsInt() jobId?: number;
  @IsOptional() @IsString() @MaxLength(64) estimateNumber?: string;
  @IsOptional() @IsString() @MaxLength(500) bidName?: string;
  @IsOptional() @IsString() bidDate?: string;
  @IsOptional() @IsString() submitDate?: string;
  @IsOptional() @IsNumber() timeEstimate?: number;
  @IsOptional() @IsIn(['draft', 'submitted', 'archived']) status?: string;

  @IsOptional() @IsObject() baseBid?: BaseBidInput;

  @IsOptional() @IsObject() companyInfo?: CompanyInfoInput;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BidSystemInputDto)
  systems?: BidSystemInputDto[];

  @IsOptional() @IsObject() computed?: ComputedSnapshot;
}

export class CalculateBidDto {
  /**
   * Opt-in server-side recalculation (verify path). When false/omitted the
   * endpoint is a no-op and returns the last stored client snapshot — the client
   * Excel engine is the source of truth for the Base Bid.
   */
  @IsOptional() @IsBoolean() forceServerCalc?: boolean;
}
