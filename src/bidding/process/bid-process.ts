/**
 * Bid-to-startup workflow (PDF: Proposed Bid-to-Project Startup Workflow).
 * One Bids row + Bid_Content.ProcessJson. No Bid_Startup table.
 *
 * Workflow stages (handoff) are not the same as outcome (awarded/lost).
 * Award/startup and lost screens are gated by outcome — not a stage you hand off into.
 */

import { dashboardPlatesMeta } from './bid-plate';
import {
  normalizeSpecSheets,
  specSheetTemplatesMeta,
  specSheetLookupsMeta,
  insulationFamiliesMeta,
  SPEC_KIND_SYSTEM_HINTS,
  SIZE_MODE_BY_KIND,
  DUCT_SHAPES,
  SPEC_COVERINGS,
  SPEC_MANUFACTURERS,
  MIKE_SIZE_MIN,
  MIKE_SIZE_MAX,
  type SpecSheet,
} from './spec-sheet';

export {
  specSheetTemplate,
  specSheetTemplatesMeta,
  SPEC_KIND_SYSTEM_HINTS,
  classifyInsulationFamily,
  classifySpecLayer,
} from './spec-sheet';
export type { SpecSheet, SpecSheetRow, SpecSheetKind, InsulationFamily } from './spec-sheet';

export const PROCESS_STAGES = [
  'intake',
  'assignment',
  'estimating_setup',
  'takeoff',
  'proposal',
  'post_bid',
  'result',
] as const;
export type ProcessStage = (typeof PROCESS_STAGES)[number];

/** Old tab-design stages still in SQL until migrate remaps. */
const LEGACY_STAGE: Record<string, ProcessStage> = {
  first_input: 'intake',
  estimating: 'estimating_setup',
  intelligence: 'post_bid',
  awarded: 'post_bid',
  production: 'post_bid',
};

export const OUTCOMES = [
  'open',
  'awarded',
  'lost',
  'no_bid',
  'cancelled',
  'postponed',
] as const;
export type OutcomeStatus = (typeof OUTCOMES)[number];

export const LOST_OUTCOMES: OutcomeStatus[] = ['lost', 'no_bid', 'cancelled', 'postponed'];

export const WORK_TYPES = ['demo', 'insulation', 'gc', 'masonry', 'other'] as const;
export type WorkType = (typeof WORK_TYPES)[number];

export const BID_KINDS = [
  'built_to_print',
  'design_build',
  'design_assist',
  'budget',
  'unknown',
  'other',
] as const;
export type BidKind = (typeof BID_KINDS)[number];

export const CLEARANCE_OPTIONS = ['us_citizen', 'us_person', 'real_id'] as const;
export type ClearanceOption = (typeof CLEARANCE_OPTIONS)[number];

export const TIER_ROLES = [
  'owner',
  'lessee',
  'cm',
  'gc',
  'first_tier',
  'mechanical',
  'us',
  'other',
] as const;
export type TierRole = (typeof TIER_ROLES)[number];

export const TAKEOFF_ROLES = [
  'duct1',
  'duct2',
  'hydronic1',
  'hydronic2',
  'plumbing1',
  'plumbing2',
  'vrf',
  'equipment',
  'other',
] as const;
export type TakeoffRole = (typeof TAKEOFF_ROLES)[number];

export const LOST_REASONS = [
  'price',
  'scope',
  'schedule',
  'relationship',
  'customer_decision',
  'no_bid_decision',
  'other',
] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export const HANDOFF_ACTIONS = ['complete', 'return'] as const;
export type HandoffAction = (typeof HANDOFF_ACTIONS)[number];

/** FollowupCRM-parity "Additional details" — see docs/BIDDING_FRONTEND_API.md. Value lists are the reference CRM's actual dropdown contents. */
export const BID_BOND_STATUSES = ['not_ordered', 'ordered_not_received', 'received'] as const;
export type BidBondStatus = (typeof BID_BOND_STATUSES)[number];

export const BUDGET_BID_OPTIONS = ['yes', 'no', 'unknown'] as const;
export type BudgetBidOption = (typeof BUDGET_BID_OPTIONS)[number];

export const WAGE_RATE_CATEGORIES = ['wage_rate_pw_dba', 'non_wage_scale'] as const;
export type WageRateCategory = (typeof WAGE_RATE_CATEGORIES)[number];

export const OCIP_CCIP_STATUSES = ['not_applicable', 'yes_gl_workmans_comp', 'yes_gl_only'] as const;
export type OcipCcipStatus = (typeof OCIP_CCIP_STATUSES)[number];

/** "Status" — the CRM's sales pipeline status, distinct from our own workflow `outcome`. */
export const SALES_STATUSES = [
  'evaluate_whether_to_bid',
  'not_pursued',
  'bid_in_process',
  'no_bid',
  'prospective_future_bid',
  'post_bid',
  'rebid_budget',
  'long_shot',
  'in_the_running_to_win',
  'lost',
  'won',
] as const;
export type SalesStatus = (typeof SALES_STATUSES)[number];

export const SUB_BUILDING_TYPES = [
  'other',
  'parochial',
  'private_college',
  'public_college',
  'public_elementary_school',
  'public_high_school',
  'public_middle_junior_high_school',
] as const;
export type SubBuildingType = (typeof SUB_BUILDING_TYPES)[number];

/** "Bid Type" — the CRM's trade/scope classification, distinct from our own `bidKind` (built-to-print/design-build/…, which gates the intake workflow). */
export const TRADE_BID_TYPES = [
  'insulation_sub',
  'demolition_sub',
  'general_construction',
  'demolition_prime',
  'insulation_prime',
  'concrete',
  'masonry',
  'wastewater',
  'pass_thru',
  'other_services',
] as const;
export type TradeBidType = (typeof TRADE_BID_TYPES)[number];

export const LEAD_SOURCES = [
  'dodge_data_analytics',
  'the_blue_book',
  'smartsheet',
  'smartbid',
  'procore',
  'planhub',
  'pipeline',
  'pantera',
  'isqft',
  'government_construction_bids',
  'email_invites_only',
  'e_builder',
  'bid_central_canadian_construction',
  'construction_bid_source',
  'coconstruct',
  'cmd_group_construction_market',
  'building_radar',
  'buildingconnected',
  'buildertrend',
  'box_net',
  'bonfire',
  'bidtracer',
  'bidclerk',
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const PROCESS_ATTACHMENT_LABELS = [
  'invitation',
  'drawings',
  'specifications',
  'addenda',
  'pla',
  'wage-decision',
  'hydronic-spec',
  'plumbing-spec',
  'duct-insulation-spec',
  'piping-spec',
  'duct-spec',
  'proposal',
  'amendment',
  'takeoff-csv',
  'takeoff-pdf',
  'startup',
  'spec-sheet-image',
] as const;

export const BOND_CLAIM_DAYS = 90;

const STRING_MAX = 500;
const NOTE_MAX = 2000;
// ponytail: PDF wants +Add with no cap; 200 is the ceiling. Raise if a job ever hits it.
const MAX_AMENDMENTS = 200;
const MAX_TIERS = 12;
const MAX_PARTIES = 40;
const MAX_INVITATIONS = 40;
const MAX_DOCUMENT_LINKS = 40;
const MAX_INVITE_ADDENDA = 40;
const MAX_COMPETITORS = 40;
const MAX_BREADCRUMBS = 200;
const MAX_PROPOSAL_VERSIONS = 50;
const MAX_TAKEOFF_VERSIONS = 40;
const MAX_INVITE_BODY = 50_000;

export type PreferredContact = 'email' | 'phone';

export type PartyContact = {
  name: string | null;
  company: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  /** Dropdown: email | phone. FE label = Preferred contact (not “Contact”). */
  preferredContact?: PreferredContact | null;
  /** Derived — the email or phone for the selected option. Do not PATCH this. */
  preferredContactValue?: string | null;
};

export const INTAKE_PARTY_ROLES = ['owner', 'architect', 'mechanical', 'invite_contact'] as const;
export type IntakePartyRole = (typeof INTAKE_PARTY_ROLES)[number];

export function partyDedupeKey(role: string, c: PartyContact): string | null {
  const label = (c.name || c.company || '').trim().toLowerCase().slice(0, 200);
  const email = (c.email || '').trim().toLowerCase().slice(0, 150);
  if (!label && !email) return null;
  return `${role}|${label}|${email}`;
}

/** Owner / architect / ME / invite contacts saved on a bid — for the parties directory. */
export function intakePartiesFromProcess(p: {
  owner?: PartyContact | null;
  architect?: PartyContact | null;
  mechanicalEngineer?: PartyContact | null;
  inviteContact?: PartyContact | null;
  invitations?: Array<{ contact?: PartyContact | null }>;
}): Array<{ role: IntakePartyRole; contact: PartyContact }> {
  const out: Array<{ role: IntakePartyRole; contact: PartyContact }> = [];
  const push = (role: IntakePartyRole, c?: PartyContact | null) => {
    if (c && partyDedupeKey(role, c)) out.push({ role, contact: c });
  };
  push('owner', p.owner);
  push('architect', p.architect);
  push('mechanical', p.mechanicalEngineer);
  for (const inv of p.invitations ?? []) push('invite_contact', inv?.contact);
  push('invite_contact', p.inviteContact);
  return out;
}

export type BidParty = PartyContact & {
  hasTheJob: boolean | null;
  receivedProposalBy: string | null;
  stillBidding: boolean | null;
};

export type Amendment = {
  number: number;
  date: string | null;
  attachmentId: number | null;
  drawingsChanged: boolean | null;
  specsChanged: boolean | null;
  phasingChanged: boolean | null;
  scopeChanged: boolean | null;
  wageRateChanged: boolean | null;
  scheduleImpact: boolean | null;
  pricingImpact: boolean | null;
  requiresEstimateRevision: boolean | null;
  notes: string | null;
};

export type DocumentLink = {
  url: string | null;
  label: string | null;
  source: string | null;
  /** Owner/federal public set — check here first for addenda. */
  checkAddenda: boolean | null;
};

export type InviteAddendum = {
  number: string | null;
  receivedAt: string | null;
  attachmentIds: number[];
  notes: string | null;
};

export type BidInvitation = {
  receivedAt: string | null;
  contact: PartyContact;
  links: DocumentLink[];
  attachmentIds: number[];
  addenda: InviteAddendum[];
  notes: string | null;
  /** Pasted invitation email / BuildingConnected dump. Not clerk notes. */
  inviteBody: string | null;
};

/** Kinds that are 100% / detailed sets — PJ: nothing to bid without drawings. */
const KINDS_NEED_DRAWINGS: BidKind[] = ['built_to_print', 'design_assist'];

export type ContractTier = {
  sortOrder: number;
  role: TierRole;
  company: string | null;
  relationship: string | null;
  contactName: string | null;
  projectManager: string | null;
  superintendent: string | null;
  foreman: string | null;
  email: string | null;
  phone: string | null;
  isBonded: boolean | null;
  bondNumber: string | null;
  bondingCompany: string | null;
  noticeTo: string | null;
  hasTheJob: boolean | null;
  invitedUs: boolean | null;
  isPaying: boolean | null;
};

export type TakeoffVersion = {
  version: number;
  createdBy: string | null;
  createdAt: string | null;
  reason: string | null;
  quantity: number | null;
  hoursSpent: number | null;
  csvAttachmentId: number | null;
  pdfAttachmentId: number | null;
};

export type TakeoffAssignment = {
  role: TakeoffRole;
  assigneeName: string | null;
  assignedAt: string | null;
  dueAt: string | null;
  status: string | null;
  hoursSpent: number | null;
  notes: string | null;
  finalQuantity: number | null;
  reviewedBy: string | null;
  versions: TakeoffVersion[];
};

export type TakeoffComparison = {
  scope: string;
  roleA: TakeoffRole;
  roleB: TakeoffRole;
  quantityA: number | null;
  quantityB: number | null;
  difference: number | null;
  differencePct: number | null;
  reconciliationRequired: boolean;
  finalQuantity: number | null;
  reviewedBy: string | null;
};

export type CompetitorIntel = {
  name: string | null;
  amount: number | null;
  source: string | null;
  confidence: string | null;
  atBid: boolean | null;
};

export type EntityRule = {
  jurisdiction: 'dc' | 'md' | 'other' | null;
  isGovernment: boolean | null;
  firstSource: 'new' | 'old' | null;
  prevailingWage: boolean | null;
  isBaltimore: boolean | null;
  isPrivateOrFederal: boolean | null;
  suggestedOurEntity: 'goel_dc' | 'dcb' | 'goel_services' | null;
};

export type BondBlock = {
  governmentOwned: boolean | null;
  lastLaborDate: string | null;
  billed100Percent: boolean | null;
  claimDueDate: string | null;
  notes: string | null;
};

/**
 * FollowupCRM-parity fields with no home elsewhere in the workflow. Fields that already
 * exist under a different name (Contract Amount = award.finalContractAmount, Job Start/End =
 * schedule.expectedStart/expectedCompletion, Follow Up = intelligence.nextFollowUpDate,
 * Technical = technicalReview.reviewDate, OCIP/CCIP = ocipCcip) are intentionally NOT
 * duplicated here — they're aliased in the list summary / filter catalog instead.
 */
export type AdditionalDetails = {
  bidNumber: string | null;
  winningCompetitor: string | null;
  mikeEstimateRef: string | null;
  websiteForBiddingDocs: string | null;
  altWebLocation1: string | null;
  altWebLocation2: string | null;
  altWebLocation3: string | null;
  wbdUsername: string | null;
  wbdPassword: string | null;
  wageRateCategory: WageRateCategory | null;
  wageRateAmount: number | null;
  grossSqFootage: number | null;
  projectNumberIfAwarded: string | null;
  usCitizenOnly: boolean | null;
  fringe: number | null;
  costPerEstimate: number | null;
  bidBondStatus: BidBondStatus | null;
  bidBondAmountRequested: number | null;
  budgetBid: BudgetBidOption | null;
  takeOffPerson: string | null;
  takeOffPerson2: string | null;
  takeOffPerson3: string | null;
  awl1Username: string | null;
  awl1Password: string | null;
  awl2Username: string | null;
  awl2Password: string | null;
  awl3Username: string | null;
  awl3Password: string | null;
  estimatorBidDate: string | null;
  rebid: boolean | null;
  engineerProjectNumber: string | null;
  contractDate: string | null;
  loginDate: string | null;
  deadDate: string | null;
  comments: string | null;
  subBuildingType: SubBuildingType | null;
  source: LeadSource | null;
  /** "Pre Bid" (pre-bid conference/meeting date) in FollowupCRM. */
  preBidDate: string | null;
  /** Sales pipeline "Status" — distinct from our own workflow `outcome`. */
  salesStatus: SalesStatus | null;
  /** Trade/scope "Bid Type" — distinct from our own `bidKind` (gates the intake workflow). */
  tradeBidType: TradeBidType | null;
  /** Single-select OCIP/CCIP status, distinct from the existing coversGl/coversWc checkboxes on Estimating Setup. */
  ocipCcipStatus: OcipCcipStatus | null;
};

/** Dates not already covered elsewhere (Follow Up / Technical / Job Start-End live on intelligence/technicalReview/schedule). */
export type SalesActivities = {
  initialContact: string | null;
  siteVisit: string | null;
  bidDrafted: string | null;
  bidDelivered: string | null;
  frontEndDocs: string | null;
  heatTracingSubPricing: string | null;
  prequalificationPackage: string | null;
  mandatoryPreBid: string | null;
};

export type BidProcess = {
  stage: ProcessStage;
  outcome: OutcomeStatus;
  workType: WorkType | null;
  bidKind: BidKind | null;
  drawingName: string | null;
  ownerProjectNumber: string | null;
  mechanicalEngineerProjectNumber: string | null;
  invitationReceivedAt: string | null;
  inviteContact: PartyContact;
  invitations: BidInvitation[];
  documentLinks: DocumentLink[];
  projectAddress: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  };
  pla: boolean | null;
  wageDecisionId: number | null;
  constructionType: string | null;
  constructionSubtype: string | null;
  mbePreference: string | null;
  owner: PartyContact;
  architect: PartyContact;
  mechanicalEngineer: PartyContact;
  clearance: ClearanceOption | null;
  entityRule: EntityRule;
  dueDate: string | null;
  dueTime: string | null;
  dateSubmitted: string | null;
  amountSubmitted: number | null;
  assignment: {
    pursue: boolean | null;
    priority: string | null;
    teamId: number | null;
    captain: string | null;
    assistantEstimator: string | null;
    bidClerk: string | null;
    internalEstimateDue: string | null;
    internalReviewDue: string | null;
  };
  technicalReview: {
    preparedBy: string | null;
    reviewedBy: string | null;
    reviewDate: string | null;
    approvedForTakeoff: boolean | null;
    comments: string | null;
  };
  labor: {
    apprenticeship: string | null;
    certifiedPayroll: boolean | null;
    calculatedLaborRate: number | null;
  };
  schedule: {
    expectedStart: string | null;
    expectedDurationDays: number | null;
    expectedCompletion: string | null;
    salesTax: number | null;
    materialEscalation: number | null;
    liftPercent: number | null;
  };
  amendments: Amendment[];
  generalContractors: BidParty[];
  mechanicals: BidParty[];
  ocipCcip: { coversGl: boolean | null; coversWc: boolean | null };
  /** Project-level. Federal work. Decide before the spec table. Not per product. */
  buyAmerican: boolean | null;
  /** Estimating Setup page — one field for the bid, not a spec-sheet column. */
  aPlus: boolean | null;
  lifts: { needed: boolean | null; addMoney: boolean | null };
  parking: { paidToWorkers: boolean | null; total: number | null };
  relatedBidId: number | null;
  relatedBidNote: string | null;
  /** Bid-level sticky Notes pad. Not invitation paste (`invitations[].inviteBody`) or clerk invite notes. */
  notes: string | null;
  whoElseBidding: {
    researched: boolean | null;
    notes: string | null;
  };
  budgetOnly: boolean | null;
  proposalIteration: number | null;
  insulationSpecs: {
    hydronic: boolean | null;
    plumbing: boolean | null;
    ductworkInsulation: boolean | null;
    piping: boolean | null;
    ductwork: boolean | null;
    equipment: boolean | null;
    other: boolean | null;
  };
  specSheets: SpecSheet[];
  takeoffAssignments: TakeoffAssignment[];
  estimateReview: {
    materialCost: number | null;
    laborCost: number | null;
    equipmentCost: number | null;
    subcontractCost: number | null;
    otherCosts: number | null;
    totalCost: number | null;
    margin: number | null;
    bidAmount: number | null;
    scopeIncluded: string | null;
    scopeExcluded: string | null;
    alternates: string | null;
    qualifications: string | null;
    notes: string | null;
  };
  proposalVersions: Array<{
    version: number;
    amount: number | null;
    date: string | null;
    preparedBy: string | null;
    reviewedBy: string | null;
    reason: string | null;
    bestAndFinal: boolean | null;
    valueEngineering: boolean | null;
    scopeChange: boolean | null;
    attachmentId: number | null;
  }>;
  submission: {
    date: string | null;
    time: string | null;
    amount: number | null;
    submittedBy: string | null;
    mechanicalContractor: string | null;
    generalContractor: string | null;
    recipientContact: string | null;
    attachmentId: number | null;
  };
  intelligence: {
    followUpOwner: string | null;
    nextFollowUpDate: string | null;
    expectedAwardDate: string | null;
    bafoRequested: boolean | null;
    revisedProposalRequired: boolean | null;
    mechanicalUnableToGetPricing: boolean | null;
    customerFeedback: string | null;
    currentProjectStatus: string | null;
    competitors: CompetitorIntel[];
    notes: string | null;
  };
  award: {
    jobNumber: string | null;
    pm: string | null;
    me: string | null;
    ops: string | null;
    awardDate: string | null;
    finalContractAmount: number | null;
    primeContractor: string | null;
    mechanicalContractor: string | null;
    performingOurEntityId: number | null;
  };
  startup: {
    formOfContract: string | null;
    contractPrice: number | null;
    laborBudget: number | null;
    materialBudget: number | null;
    equipmentBudget: number | null;
    bondCost: number | null;
    otherBudget: number | null;
    totalManhours: number | null;
    avgLaborRate: number | null;
    projectedStart: string | null;
    projectedCompletion: string | null;
    certifiedPayroll: boolean | null;
    taxExemption: boolean | null;
    travelParking: string | null;
    scheduleReceived: boolean | null;
    sovReceived: boolean | null;
    specialInstructions: string | null;
  };
  lost: {
    date: string | null;
    awardedMechanical: string | null;
    awardedInsulation: string | null;
    winningPrice: number | null;
    ourFinalPrice: number | null;
    difference: number | null;
    reason: LostReason | null;
    notes: string | null;
    possibleRebid: boolean | null;
    relatedOpportunityId: number | null;
  };
  contractTiers: ContractTier[];
  bond: BondBlock;
  breadcrumbs: Array<{ at: string | null; text: string }>;
  additionalDetails: AdditionalDetails;
  salesActivities: SalesActivities;
};

export type WorkflowChrome = {
  stage: ProcessStage;
  outcome: OutcomeStatus;
  nextStage: ProcessStage | null;
  prevStage: ProcessStage | null;
  canComplete: boolean;
  canReturn: boolean;
  completeBlockedReason: string | null;
  /** Last pre tab — always. Win/lose lives here and can be changed. */
  showOutcomeTab: true;
  outcomeEditable: boolean;
  showAward: boolean;
  showLost: boolean;
  takeoffComparisons: TakeoffComparison[];
};

export function emptyParty(): PartyContact {
  return {
    name: null,
    company: null,
    contactName: null,
    email: null,
    phone: null,
    preferredContact: null,
    preferredContactValue: null,
  };
}

const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM',
  'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
  'WV', 'WI', 'WY',
]);

/** Fill city/state/zip from a pasted US line when those fields are empty. Keeps line1. */
export function fillProjectAddress(addr: {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}): typeof addr {
  const parsed = parseUsAddress([addr.line1, addr.line2].filter(Boolean).join(', '));
  return {
    line1: addr.line1,
    line2: addr.line2,
    city: addr.city || parsed.city,
    state: addr.state || parsed.state,
    zip: addr.zip || parsed.zip,
  };
}

export function parseUsAddress(raw: string): { city: string | null; state: string | null; zip: string | null } {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (!s) return { city: null, state: null, zip: null };
  const zipM = s.match(/\b(\d{5}(?:-\d{4})?)\s*$/);
  const zip = zipM?.[1] ?? null;
  let rest = zipM?.index != null ? s.slice(0, zipM.index).replace(/[,\s]+$/, '') : s;
  const stM = rest.match(/(?:,|\s)\s*([A-Za-z]{2})\s*$/);
  let state: string | null = null;
  if (stM && US_STATES.has(stM[1].toUpperCase())) {
    state = stM[1].toUpperCase();
    rest = rest.slice(0, stM.index).replace(/[,\s]+$/, '');
  }
  const comma = rest.lastIndexOf(',');
  const city = (comma >= 0 ? rest.slice(comma + 1) : rest).trim() || null;
  return { city, state, zip };
}

export function emptyProcess(): BidProcess {
  return {
    stage: 'intake',
    outcome: 'open',
    workType: null,
    bidKind: null,
    drawingName: null,
    ownerProjectNumber: null,
    mechanicalEngineerProjectNumber: null,
    invitationReceivedAt: null,
    inviteContact: emptyParty(),
    invitations: [],
    documentLinks: [],
    projectAddress: { line1: null, line2: null, city: null, state: null, zip: null },
    pla: null,
    wageDecisionId: null,
    constructionType: null,
    constructionSubtype: null,
    mbePreference: null,
    owner: emptyParty(),
    architect: emptyParty(),
    mechanicalEngineer: emptyParty(),
    clearance: null,
    entityRule: {
      jurisdiction: null,
      isGovernment: null,
      firstSource: null,
      prevailingWage: null,
      isBaltimore: null,
      isPrivateOrFederal: null,
      suggestedOurEntity: null,
    },
    dueDate: null,
    dueTime: null,
    dateSubmitted: null,
    amountSubmitted: null,
    assignment: {
      pursue: null,
      priority: null,
      teamId: null,
      captain: null,
      assistantEstimator: null,
      bidClerk: null,
      internalEstimateDue: null,
      internalReviewDue: null,
    },
    technicalReview: {
      preparedBy: null,
      reviewedBy: null,
      reviewDate: null,
      approvedForTakeoff: null,
      comments: null,
    },
    labor: { apprenticeship: null, certifiedPayroll: null, calculatedLaborRate: null },
    schedule: {
      expectedStart: null,
      expectedDurationDays: null,
      expectedCompletion: null,
      salesTax: null,
      materialEscalation: null,
      liftPercent: null,
    },
    amendments: [],
    generalContractors: [],
    mechanicals: [],
    ocipCcip: { coversGl: null, coversWc: null },
    buyAmerican: null,
    aPlus: null,
    lifts: { needed: null, addMoney: null },
    parking: { paidToWorkers: null, total: null },
    relatedBidId: null,
    relatedBidNote: null,
    notes: null,
    whoElseBidding: { researched: null, notes: null },
    budgetOnly: null,
    proposalIteration: null,
    insulationSpecs: {
      hydronic: null,
      plumbing: null,
      ductworkInsulation: null,
      piping: null,
      ductwork: null,
      equipment: null,
      other: null,
    },
    specSheets: [],
    takeoffAssignments: [],
    estimateReview: {
      materialCost: null,
      laborCost: null,
      equipmentCost: null,
      subcontractCost: null,
      otherCosts: null,
      totalCost: null,
      margin: null,
      bidAmount: null,
      scopeIncluded: null,
      scopeExcluded: null,
      alternates: null,
      qualifications: null,
      notes: null,
    },
    proposalVersions: [],
    submission: {
      date: null,
      time: null,
      amount: null,
      submittedBy: null,
      mechanicalContractor: null,
      generalContractor: null,
      recipientContact: null,
      attachmentId: null,
    },
    intelligence: {
      followUpOwner: null,
      nextFollowUpDate: null,
      expectedAwardDate: null,
      bafoRequested: null,
      revisedProposalRequired: null,
      mechanicalUnableToGetPricing: null,
      customerFeedback: null,
      currentProjectStatus: null,
      competitors: [],
      notes: null,
    },
    award: {
      jobNumber: null,
      pm: null,
      me: null,
      ops: null,
      awardDate: null,
      finalContractAmount: null,
      primeContractor: null,
      mechanicalContractor: null,
      performingOurEntityId: null,
    },
    startup: {
      formOfContract: null,
      contractPrice: null,
      laborBudget: null,
      materialBudget: null,
      equipmentBudget: null,
      bondCost: null,
      otherBudget: null,
      totalManhours: null,
      avgLaborRate: null,
      projectedStart: null,
      projectedCompletion: null,
      certifiedPayroll: null,
      taxExemption: null,
      travelParking: null,
      scheduleReceived: null,
      sovReceived: null,
      specialInstructions: null,
    },
    lost: {
      date: null,
      awardedMechanical: null,
      awardedInsulation: null,
      winningPrice: null,
      ourFinalPrice: null,
      difference: null,
      reason: null,
      notes: null,
      possibleRebid: null,
      relatedOpportunityId: null,
    },
    contractTiers: [],
    bond: {
      governmentOwned: null,
      lastLaborDate: null,
      billed100Percent: null,
      claimDueDate: null,
      notes: null,
    },
    breadcrumbs: [],
    additionalDetails: {
      bidNumber: null,
      winningCompetitor: null,
      mikeEstimateRef: null,
      websiteForBiddingDocs: null,
      altWebLocation1: null,
      altWebLocation2: null,
      altWebLocation3: null,
      wbdUsername: null,
      wbdPassword: null,
      wageRateCategory: null,
      wageRateAmount: null,
      grossSqFootage: null,
      projectNumberIfAwarded: null,
      usCitizenOnly: null,
      fringe: null,
      costPerEstimate: null,
      bidBondStatus: null,
      bidBondAmountRequested: null,
      budgetBid: null,
      takeOffPerson: null,
      takeOffPerson2: null,
      takeOffPerson3: null,
      awl1Username: null,
      awl1Password: null,
      awl2Username: null,
      awl2Password: null,
      awl3Username: null,
      awl3Password: null,
      estimatorBidDate: null,
      rebid: null,
      engineerProjectNumber: null,
      contractDate: null,
      loginDate: null,
      deadDate: null,
      comments: null,
      subBuildingType: null,
      source: null,
      preBidDate: null,
      salesStatus: null,
      tradeBidType: null,
      ocipCcipStatus: null,
    },
    salesActivities: {
      initialContact: null,
      siteVisit: null,
      bidDrafted: null,
      bidDelivered: null,
      frontEndDocs: null,
      heatTracingSubPricing: null,
      prequalificationPackage: null,
      mandatoryPreBid: null,
    },
  };
}

/** DC govt → Goel DC; MD state/city prevailing → DCB; MD private/federal → Goel Services. */
export function suggestOurEntity(rule: EntityRule): EntityRule['suggestedOurEntity'] {
  if (rule.jurisdiction === 'dc') return 'goel_dc';
  if (rule.jurisdiction === 'md') {
    if (rule.isPrivateOrFederal) return 'goel_services';
    if (rule.isGovernment || rule.isBaltimore || rule.prevailingWage) return 'dcb';
    return 'dcb';
  }
  return null;
}

export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function claimDueDate(lastLaborDate: string | null, governmentOwned: boolean | null): string | null {
  if (!lastLaborDate || governmentOwned !== true) return null;
  return addDaysIso(lastLaborDate, BOND_CLAIM_DAYS);
}

export function ourTierIndex(tiers: ContractTier[]): number | null {
  const i = [...tiers]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .findIndex((t) => t.role === 'us');
  return i < 0 ? null : i;
}

/**
 * Parses already-stored process JSON for display (list/detail reads). Deliberately does NOT
 * throw on values that fail current validation (e.g. an enum whose allowed values changed
 * since the row was saved) — one legacy/edge-case bid must never break the whole list. Writes
 * (mergeProcess called directly from create/patch) stay strictly validated.
 */
export function parseProcess(raw: unknown): BidProcess {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyProcess();
  try {
    return mergeProcess(emptyProcess(), raw as Record<string, unknown>);
  } catch (e) {
    if (!(e instanceof BidProcessError)) throw e;
    return mergeProcess(emptyProcess(), raw as Record<string, unknown>, { skipValidation: true });
  }
}

/**
 * Shallow-merge objects; arrays replace. Then fill suggested entity + bond claim date.
 */
export function mergeProcess(
  existing: BidProcess,
  patch: Record<string, unknown>,
  opts?: { skipValidation?: boolean },
): BidProcess {
  const next = structuredClone(existing) as BidProcess;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (!(key in next)) continue;
    const cur = (next as Record<string, unknown>)[key];
    if (isPlainObject(cur) && isPlainObject(value) && !Array.isArray(value)) {
      (next as Record<string, unknown>)[key] = { ...(cur as object), ...(value as object) };
    } else {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  normalizeProcess(next);
  next.entityRule.suggestedOurEntity = suggestOurEntity(next.entityRule);
  next.bond.claimDueDate = claimDueDate(next.bond.lastLaborDate, next.bond.governmentOwned);
  if (next.lost.winningPrice != null && next.lost.ourFinalPrice != null) {
    next.lost.difference = next.lost.winningPrice - next.lost.ourFinalPrice;
  }
  if (!opts?.skipValidation) assertProcess(next);
  return next;
}

export class BidProcessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BidProcessError';
  }
}

export function nextStage(stage: ProcessStage): ProcessStage | null {
  const i = PROCESS_STAGES.indexOf(stage);
  return i >= 0 && i < PROCESS_STAGES.length - 1 ? PROCESS_STAGES[i + 1] : null;
}

export function prevStage(stage: ProcessStage): ProcessStage | null {
  const i = PROCESS_STAGES.indexOf(stage);
  return i > 0 ? PROCESS_STAGES[i - 1] : null;
}

export type HandoffCtx = { hasDrawings?: boolean };

/** Strip `#` / spaces so C.480 and #C.480 match (PJ). */
export function normalizeProjectNumber(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).replace(/#/g, '').replace(/\s+/g, '').trim();
  return s || null;
}

export function kindsNeedDrawings(kind: BidKind | null): boolean {
  return kind != null && KINDS_NEED_DRAWINGS.includes(kind);
}

export function intakeCompleteBlocked(p: BidProcess, hasDrawings: boolean): string | null {
  if (!p.bidKind || p.bidKind === 'other') return 'Bid type is required before handing off';
  if (kindsNeedDrawings(p.bidKind) && !hasDrawings) {
    return 'Drawings are required for this bid type';
  }
  if (p.invitations.length < 2 && p.whoElseBidding.researched !== true) {
    return 'Only one invitation — research who else is bidding, then confirm';
  }
  return null;
}

/** Move a mistaken second bid's invites onto the keeper. */
export function absorbIntake(keep: BidProcess, from: BidProcess): BidProcess {
  return mergeProcess(keep, {
    invitations: [...keep.invitations, ...from.invitations].slice(0, MAX_INVITATIONS),
    documentLinks: [...keep.documentLinks, ...from.documentLinks].slice(0, MAX_DOCUMENT_LINKS),
    ownerProjectNumber: keep.ownerProjectNumber || from.ownerProjectNumber,
    mechanicalEngineerProjectNumber:
      keep.mechanicalEngineerProjectNumber || from.mechanicalEngineerProjectNumber,
    drawingName: keep.drawingName || from.drawingName,
  });
}

export function applyHandoff(
  p: BidProcess,
  action: HandoffAction,
  notes?: string | null,
  ctx?: HandoffCtx,
): BidProcess {
  const next = structuredClone(p) as BidProcess;
  if (action === 'return') {
    const prev = prevStage(next.stage);
    if (!prev) throw new BidProcessError('Already at intake; cannot return');
    next.stage = prev;
    pushBreadcrumb(next, notes || `Returned to ${STAGE_LABELS[prev]}`);
    assertProcess(next);
    return next;
  }
  if (next.stage === 'intake') {
    const reason = intakeCompleteBlocked(next, ctx?.hasDrawings === true);
    if (reason) throw new BidProcessError(reason);
  }
  if (next.stage === 'assignment' && next.assignment.pursue === false) {
    if (next.outcome === 'open') next.outcome = 'no_bid';
    next.stage = 'result';
    pushBreadcrumb(next, notes || 'No-bid — jumped to Outcome tab (still changeable)');
    assertProcess(next);
    return next;
  }
  if (next.stage === 'estimating_setup' && next.technicalReview.approvedForTakeoff !== true) {
    throw new BidProcessError('Approved for takeoff is required before handing off to takeoff');
  }
  const nxt = nextStage(next.stage);
  if (!nxt) {
    throw new BidProcessError('Already on Outcome; change win/lose on this tab — it is not a one-shot');
  }
  next.stage = nxt;
  pushBreadcrumb(next, notes || `Handed off to ${STAGE_LABELS[nxt]}`);
  assertProcess(next);
  return next;
}

export function applyOutcome(p: BidProcess, outcome: OutcomeStatus): BidProcess {
  if (!OUTCOMES.includes(outcome)) throw new BidProcessError(`Invalid outcome: ${outcome}`);
  const next = structuredClone(p) as BidProcess;
  const from = next.outcome;
  next.outcome = outcome;
  if (next.stage !== 'result') next.stage = 'result';
  pushBreadcrumb(next, from === outcome ? `Outcome ${outcome}` : `Outcome ${from} → ${outcome}`);
  assertProcess(next);
  return next;
}

export function takeoffComparisons(assignments: TakeoffAssignment[]): TakeoffComparison[] {
  const pairs: Array<[string, TakeoffRole, TakeoffRole]> = [
    ['duct', 'duct1', 'duct2'],
    ['hydronic', 'hydronic1', 'hydronic2'],
    ['plumbing', 'plumbing1', 'plumbing2'],
  ];
  const byRole = new Map(assignments.map((a) => [a.role, a]));
  return pairs.map(([scope, roleA, roleB]) => {
    const a = byRole.get(roleA);
    const b = byRole.get(roleB);
    const quantityA = latestQty(a);
    const quantityB = latestQty(b);
    const difference = quantityA != null && quantityB != null ? quantityB - quantityA : null;
    const differencePct =
      difference != null && quantityA != null && quantityA !== 0 ? difference / quantityA : null;
    const reconciliationRequired = difference != null && difference !== 0;
    return {
      scope,
      roleA,
      roleB,
      quantityA,
      quantityB,
      difference,
      differencePct,
      reconciliationRequired,
      finalQuantity: a?.finalQuantity ?? b?.finalQuantity ?? null,
      reviewedBy: a?.reviewedBy ?? b?.reviewedBy ?? null,
    };
  });
}

export function workflowChrome(p: BidProcess, ctx?: HandoffCtx): WorkflowChrome {
  const nxt = nextStage(p.stage);
  const prev = prevStage(p.stage);
  let completeBlockedReason: string | null = null;
  let canComplete = false;
  const intakeBlock = p.stage === 'intake' ? intakeCompleteBlocked(p, ctx?.hasDrawings === true) : null;
  if (intakeBlock) {
    completeBlockedReason = intakeBlock;
  } else if (p.stage === 'estimating_setup' && p.technicalReview.approvedForTakeoff !== true) {
    completeBlockedReason = 'Approved for takeoff is required before handing off to takeoff';
  } else if (!nxt) {
    completeBlockedReason = 'On Outcome tab — change win/lose anytime; post screens follow';
  } else {
    canComplete = true;
  }
  return {
    stage: p.stage,
    outcome: p.outcome,
    nextStage: nxt,
    prevStage: prev,
    canComplete,
    canReturn: prev != null,
    completeBlockedReason,
    showOutcomeTab: true,
    outcomeEditable: true,
    showAward: p.outcome === 'awarded',
    showLost: LOST_OUTCOMES.includes(p.outcome),
    takeoffComparisons: takeoffComparisons(p.takeoffAssignments),
  };
}

function latestQty(a: TakeoffAssignment | undefined): number | null {
  if (!a) return null;
  if (a.finalQuantity != null) return a.finalQuantity;
  const last = a.versions[a.versions.length - 1];
  return last?.quantity ?? null;
}

function pushBreadcrumb(p: BidProcess, text: string): void {
  p.breadcrumbs = [
    ...p.breadcrumbs,
    { at: new Date().toISOString(), text: text.slice(0, NOTE_MAX) },
  ].slice(-MAX_BREADCRUMBS);
}

function assertProcess(p: BidProcess): void {
  if (!PROCESS_STAGES.includes(p.stage)) throw new BidProcessError(`Invalid process.stage: ${p.stage}`);
  if (!OUTCOMES.includes(p.outcome)) throw new BidProcessError(`Invalid process.outcome: ${p.outcome}`);
  if (p.workType != null && !WORK_TYPES.includes(p.workType)) {
    throw new BidProcessError(`Invalid process.workType: ${p.workType}`);
  }
  if (p.bidKind != null && !BID_KINDS.includes(p.bidKind)) {
    throw new BidProcessError(`Invalid process.bidKind: ${p.bidKind}`);
  }
  if (p.clearance != null && !CLEARANCE_OPTIONS.includes(p.clearance)) {
    throw new BidProcessError(`Invalid process.clearance: ${p.clearance}`);
  }
  if (p.lost.reason != null && !LOST_REASONS.includes(p.lost.reason)) {
    throw new BidProcessError(`Invalid process.lost.reason: ${p.lost.reason}`);
  }
  if (
    p.additionalDetails.bidBondStatus != null &&
    !BID_BOND_STATUSES.includes(p.additionalDetails.bidBondStatus)
  ) {
    throw new BidProcessError(`Invalid process.additionalDetails.bidBondStatus: ${p.additionalDetails.bidBondStatus}`);
  }
  if (p.additionalDetails.budgetBid != null && !BUDGET_BID_OPTIONS.includes(p.additionalDetails.budgetBid)) {
    throw new BidProcessError(`Invalid process.additionalDetails.budgetBid: ${p.additionalDetails.budgetBid}`);
  }
  if (
    p.additionalDetails.wageRateCategory != null &&
    !WAGE_RATE_CATEGORIES.includes(p.additionalDetails.wageRateCategory)
  ) {
    throw new BidProcessError(
      `Invalid process.additionalDetails.wageRateCategory: ${p.additionalDetails.wageRateCategory}`,
    );
  }
  if (
    p.additionalDetails.ocipCcipStatus != null &&
    !OCIP_CCIP_STATUSES.includes(p.additionalDetails.ocipCcipStatus)
  ) {
    throw new BidProcessError(
      `Invalid process.additionalDetails.ocipCcipStatus: ${p.additionalDetails.ocipCcipStatus}`,
    );
  }
  if (p.additionalDetails.salesStatus != null && !SALES_STATUSES.includes(p.additionalDetails.salesStatus)) {
    throw new BidProcessError(`Invalid process.additionalDetails.salesStatus: ${p.additionalDetails.salesStatus}`);
  }
  if (
    p.additionalDetails.subBuildingType != null &&
    !SUB_BUILDING_TYPES.includes(p.additionalDetails.subBuildingType)
  ) {
    throw new BidProcessError(
      `Invalid process.additionalDetails.subBuildingType: ${p.additionalDetails.subBuildingType}`,
    );
  }
  if (p.additionalDetails.tradeBidType != null && !TRADE_BID_TYPES.includes(p.additionalDetails.tradeBidType)) {
    throw new BidProcessError(`Invalid process.additionalDetails.tradeBidType: ${p.additionalDetails.tradeBidType}`);
  }
  if (p.additionalDetails.source != null && !LEAD_SOURCES.includes(p.additionalDetails.source)) {
    throw new BidProcessError(`Invalid process.additionalDetails.source: ${p.additionalDetails.source}`);
  }
  if (p.amendments.length > MAX_AMENDMENTS) {
    throw new BidProcessError(`process.amendments max ${MAX_AMENDMENTS}`);
  }
  if (p.contractTiers.length > MAX_TIERS) {
    throw new BidProcessError(`process.contractTiers max ${MAX_TIERS}`);
  }
  if (p.generalContractors.length > MAX_PARTIES || p.mechanicals.length > MAX_PARTIES) {
    throw new BidProcessError(`process GC/mechanical lists max ${MAX_PARTIES}`);
  }
  if (p.invitations.length > MAX_INVITATIONS) {
    throw new BidProcessError(`process.invitations max ${MAX_INVITATIONS}`);
  }
  if (p.documentLinks.length > MAX_DOCUMENT_LINKS) {
    throw new BidProcessError(`process.documentLinks max ${MAX_DOCUMENT_LINKS}`);
  }
  if (p.intelligence.competitors.length > MAX_COMPETITORS) {
    throw new BidProcessError(`process.intelligence.competitors max ${MAX_COMPETITORS}`);
  }
  if (p.proposalVersions.length > MAX_PROPOSAL_VERSIONS) {
    throw new BidProcessError(`process.proposalVersions max ${MAX_PROPOSAL_VERSIONS}`);
  }
  if (p.breadcrumbs.length > MAX_BREADCRUMBS) {
    throw new BidProcessError(`process.breadcrumbs max ${MAX_BREADCRUMBS}`);
  }
  for (const t of p.contractTiers) {
    if (!TIER_ROLES.includes(t.role)) throw new BidProcessError(`Invalid contractTiers.role: ${t.role}`);
  }
  for (const a of p.takeoffAssignments) {
    if (!TAKEOFF_ROLES.includes(a.role)) throw new BidProcessError(`Invalid takeoffAssignments.role: ${a.role}`);
    if (a.versions.length > MAX_TAKEOFF_VERSIONS) {
      throw new BidProcessError(`takeoff version history max ${MAX_TAKEOFF_VERSIONS} per assignment`);
    }
  }
  walkStrings(p);
  walkNumbers(p, 'process');
}

function remapLegacyStage(raw: unknown, outcome: OutcomeStatus): { stage: ProcessStage; outcome: OutcomeStatus } {
  const s = String(raw || 'intake');
  if (PROCESS_STAGES.includes(s as ProcessStage)) return { stage: s as ProcessStage, outcome };
  const mapped = LEGACY_STAGE[s];
  if (!mapped) throw new BidProcessError(`Invalid process.stage: ${s}`);
  const nextOutcome = s === 'awarded' && outcome === 'open' ? 'awarded' : outcome;
  return { stage: mapped, outcome: nextOutcome };
}

function normalizeProcess(p: BidProcess): void {
  const mapped = remapLegacyStage(p.stage, (p.outcome as OutcomeStatus) || 'open');
  p.stage = mapped.stage;
  p.outcome = mapped.outcome;
  if (!OUTCOMES.includes(p.outcome)) p.outcome = 'open';
  p.wageDecisionId = numOrNull(p.wageDecisionId);
  p.relatedBidId = numOrNull(p.relatedBidId);
  p.relatedBidNote = nullishStr(p.relatedBidNote);
  p.notes = nullishStr(p.notes);
  p.ownerProjectNumber = normalizeProjectNumber(p.ownerProjectNumber);
  p.mechanicalEngineerProjectNumber = normalizeProjectNumber(p.mechanicalEngineerProjectNumber);
  if (p.assignment && typeof p.assignment === 'object') {
    p.assignment.teamId = numOrNull(p.assignment.teamId);
  }
  if (p.bidKind === 'budget') p.budgetOnly = true;
  else if (p.budgetOnly === true && (p.bidKind == null || p.bidKind === 'other')) {
    p.bidKind = 'budget';
  }
  p.amountSubmitted = numOrNull(p.amountSubmitted);
  p.proposalIteration = numOrNull(p.proposalIteration);
  const nest = emptyProcess();
  if (!p.award || typeof p.award !== 'object') p.award = nest.award;
  else p.award.performingOurEntityId = numOrNull(p.award.performingOurEntityId);
  if (!p.startup || typeof p.startup !== 'object') p.startup = nest.startup;
  if (!p.lost || typeof p.lost !== 'object') p.lost = nest.lost;
  else {
    p.lost.winningPrice = numOrNull(p.lost.winningPrice);
    p.lost.ourFinalPrice = numOrNull(p.lost.ourFinalPrice);
    p.lost.relatedOpportunityId = numOrNull(p.lost.relatedOpportunityId);
  }
  if (!p.assignment || typeof p.assignment !== 'object') p.assignment = nest.assignment;
  if (!p.technicalReview || typeof p.technicalReview !== 'object') p.technicalReview = nest.technicalReview;
  if (!p.labor || typeof p.labor !== 'object') p.labor = nest.labor;
  else p.labor.calculatedLaborRate = numOrNull(p.labor.calculatedLaborRate);
  if (!p.schedule || typeof p.schedule !== 'object') p.schedule = nest.schedule;
  else {
    p.schedule.expectedDurationDays = numOrNull(p.schedule.expectedDurationDays);
    p.schedule.salesTax = numOrNull(p.schedule.salesTax);
    p.schedule.materialEscalation = numOrNull(p.schedule.materialEscalation);
    p.schedule.liftPercent = numOrNull(p.schedule.liftPercent);
  }
  if (!p.estimateReview || typeof p.estimateReview !== 'object') p.estimateReview = nest.estimateReview;
  if (!p.submission || typeof p.submission !== 'object') p.submission = nest.submission;
  else p.submission.attachmentId = numOrNull(p.submission.attachmentId);
  if (!p.entityRule || typeof p.entityRule !== 'object') p.entityRule = nest.entityRule;
  if (!p.bond || typeof p.bond !== 'object') p.bond = nest.bond;
  if (!p.projectAddress || typeof p.projectAddress !== 'object') p.projectAddress = nest.projectAddress;
  p.projectAddress = fillProjectAddress({
    line1: nullishStr(p.projectAddress.line1),
    line2: nullishStr(p.projectAddress.line2),
    city: nullishStr(p.projectAddress.city),
    state: nullishStr(p.projectAddress.state),
    zip: nullishStr(p.projectAddress.zip),
  });
  if (!p.inviteContact || typeof p.inviteContact !== 'object') p.inviteContact = emptyParty();
  else p.inviteContact = normalizeContact(p.inviteContact);
  if (!p.whoElseBidding || typeof p.whoElseBidding !== 'object') {
    p.whoElseBidding = nest.whoElseBidding;
  }
  if (!Array.isArray(p.invitations)) p.invitations = [];
  if (!Array.isArray(p.documentLinks)) p.documentLinks = [];
  if (!p.owner || typeof p.owner !== 'object') p.owner = emptyParty();
  else p.owner = normalizeContact(p.owner);
  if (!p.architect || typeof p.architect !== 'object') p.architect = emptyParty();
  else p.architect = normalizeContact(p.architect);
  if (!p.mechanicalEngineer || typeof p.mechanicalEngineer !== 'object') {
    p.mechanicalEngineer = emptyParty();
  } else {
    p.mechanicalEngineer = normalizeContact(p.mechanicalEngineer);
  }
  if (!p.ocipCcip || typeof p.ocipCcip !== 'object') p.ocipCcip = nest.ocipCcip;
  p.aPlus = triBool(p.aPlus);
  if (!p.lifts || typeof p.lifts !== 'object') p.lifts = nest.lifts;
  if (!p.parking || typeof p.parking !== 'object') p.parking = nest.parking;
  if (!p.insulationSpecs || typeof p.insulationSpecs !== 'object') p.insulationSpecs = nest.insulationSpecs;
  if (p.specSheets != null && !Array.isArray(p.specSheets)) {
    throw new BidProcessError('process.specSheets must be an array');
  }
  try {
    p.specSheets = normalizeSpecSheets(p.specSheets);
  } catch (e) {
    throw new BidProcessError(e instanceof Error ? e.message : 'process.specSheets invalid');
  }
  if (!Array.isArray(p.amendments)) p.amendments = [];
  if (!Array.isArray(p.contractTiers)) p.contractTiers = [];
  if (!Array.isArray(p.generalContractors)) p.generalContractors = [];
  if (!Array.isArray(p.mechanicals)) p.mechanicals = [];
  if (!Array.isArray(p.takeoffAssignments)) p.takeoffAssignments = [];
  if (!Array.isArray(p.proposalVersions)) p.proposalVersions = [];
  if (!Array.isArray(p.breadcrumbs)) p.breadcrumbs = [];
  if (!p.intelligence || typeof p.intelligence !== 'object') p.intelligence = nest.intelligence;
  if (!Array.isArray(p.intelligence.competitors)) p.intelligence.competitors = [];
  p.amendments = p.amendments.map((a, i) => ({
    number: Number(a?.number) || i + 1,
    date: nullishStr(a?.date),
    attachmentId: numOrNull(a?.attachmentId),
    drawingsChanged: a?.drawingsChanged ?? null,
    specsChanged: a?.specsChanged ?? null,
    phasingChanged: a?.phasingChanged ?? null,
    scopeChanged: a?.scopeChanged ?? null,
    wageRateChanged: a?.wageRateChanged ?? null,
    scheduleImpact: a?.scheduleImpact ?? null,
    pricingImpact: a?.pricingImpact ?? null,
    requiresEstimateRevision: a?.requiresEstimateRevision ?? null,
    notes: nullishStr(a?.notes),
  }));
  p.contractTiers = p.contractTiers.map((t, i) => ({
    sortOrder: Number(t?.sortOrder) || i,
    role: t?.role,
    company: nullishStr(t?.company),
    relationship: nullishStr(t?.relationship),
    contactName: nullishStr(t?.contactName),
    projectManager: nullishStr(t?.projectManager),
    superintendent: nullishStr(t?.superintendent),
    foreman: nullishStr(t?.foreman),
    email: nullishStr(t?.email),
    phone: nullishStr(t?.phone),
    isBonded: t?.isBonded ?? null,
    bondNumber: nullishStr(t?.bondNumber),
    bondingCompany: nullishStr(t?.bondingCompany),
    noticeTo: nullishStr(t?.noticeTo),
    hasTheJob: t?.hasTheJob ?? null,
    invitedUs: t?.invitedUs ?? null,
    isPaying: t?.isPaying ?? null,
  }));
  p.documentLinks = p.documentLinks.map(normalizeDocumentLink);
  p.invitations = p.invitations.map((inv) => ({
    receivedAt: nullishStr(inv?.receivedAt),
    contact: normalizeContact(inv?.contact),
    links: Array.isArray(inv?.links) ? inv.links.map(normalizeDocumentLink) : [],
    attachmentIds: Array.isArray(inv?.attachmentIds)
      ? inv.attachmentIds.map(numOrNull).filter((n): n is number => n != null)
      : [],
    addenda: Array.isArray(inv?.addenda)
      ? inv.addenda.slice(0, MAX_INVITE_ADDENDA).map((a) => ({
          number: nullishStr(a?.number),
          receivedAt: nullishStr(a?.receivedAt),
          attachmentIds: Array.isArray(a?.attachmentIds)
            ? a.attachmentIds.map(numOrNull).filter((n): n is number => n != null)
            : [],
          notes: nullishStr(a?.notes),
        }))
      : [],
    notes: nullishStr(inv?.notes),
    inviteBody: clipStr(inv?.inviteBody, MAX_INVITE_BODY),
  }));
  if (p.invitations.length === 0 && invitationSeed(p)) {
    p.invitations = [
      {
        receivedAt: p.invitationReceivedAt,
        contact: p.inviteContact,
        links: [],
        attachmentIds: [],
        addenda: [],
        notes: null,
        inviteBody: null,
      },
    ];
  } else if (p.invitations.length > 0) {
    p.inviteContact = { ...emptyParty(), ...p.invitations[0].contact };
    if (p.invitations[0].receivedAt) p.invitationReceivedAt = p.invitations[0].receivedAt;
  }
  p.takeoffAssignments = p.takeoffAssignments.map((a) => ({
    role: a?.role,
    assigneeName: nullishStr(a?.assigneeName),
    assignedAt: nullishStr(a?.assignedAt),
    dueAt: nullishStr(a?.dueAt),
    status: nullishStr(a?.status),
    hoursSpent: numOrNull(a?.hoursSpent),
    notes: nullishStr(a?.notes),
    finalQuantity: numOrNull(a?.finalQuantity),
    reviewedBy: nullishStr(a?.reviewedBy),
    versions: Array.isArray(a?.versions)
      ? a.versions.map((v, i) => ({
          version: Number(v?.version) || i + 1,
          createdBy: nullishStr(v?.createdBy),
          createdAt: nullishStr(v?.createdAt),
          reason: nullishStr(v?.reason),
          quantity: numOrNull(v?.quantity),
          hoursSpent: numOrNull(v?.hoursSpent),
          csvAttachmentId: numOrNull(v?.csvAttachmentId),
          pdfAttachmentId: numOrNull(v?.pdfAttachmentId),
        }))
      : [],
  }));
  p.generalContractors = p.generalContractors.map(normalizeParty);
  p.mechanicals = p.mechanicals.map(normalizeParty);
  p.proposalVersions = p.proposalVersions.map((v, i) => ({
    version: Number(v?.version) || i + 1,
    amount: numOrNull(v?.amount),
    date: nullishStr(v?.date),
    preparedBy: nullishStr(v?.preparedBy),
    reviewedBy: nullishStr(v?.reviewedBy),
    reason: nullishStr(v?.reason),
    bestAndFinal: v?.bestAndFinal ?? null,
    valueEngineering: v?.valueEngineering ?? null,
    scopeChange: v?.scopeChange ?? null,
    attachmentId: numOrNull(v?.attachmentId),
  }));
}

function preferredOf(v: unknown): PreferredContact | null {
  return v === 'email' || v === 'phone' ? v : null;
}

function clipStr(v: unknown, max: number): string | null {
  const s = nullishStr(v);
  return s && s.length > max ? s.slice(0, max) : s;
}

function normalizeContact(c: PartyContact | null | undefined): PartyContact {
  const email = nullishStr(c?.email);
  const phone = nullishStr(c?.phone);
  const preferredContact = preferredOf(c?.preferredContact);
  return {
    name: nullishStr(c?.name),
    company: nullishStr(c?.company),
    contactName: nullishStr(c?.contactName),
    email,
    phone,
    preferredContact,
    preferredContactValue: preferredContact === 'email' ? email : preferredContact === 'phone' ? phone : null,
  };
}

function normalizeParty(p: BidParty): BidParty {
  return {
    ...normalizeContact(p),
    hasTheJob: p?.hasTheJob ?? null,
    receivedProposalBy: nullishStr(p?.receivedProposalBy),
    stillBidding: p?.stillBidding ?? null,
  };
}

function normalizeDocumentLink(l: DocumentLink): DocumentLink {
  return {
    url: nullishStr(l?.url),
    label: nullishStr(l?.label),
    source: nullishStr(l?.source),
    checkAddenda: l?.checkAddenda ?? null,
  };
}

function invitationSeed(p: BidProcess): boolean {
  return !!(
    p.invitationReceivedAt ||
    p.inviteContact?.name ||
    p.inviteContact?.company ||
    p.inviteContact?.contactName ||
    p.inviteContact?.email ||
    p.inviteContact?.phone
  );
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function triBool(v: unknown): boolean | null {
  if (v === true || v === false) return v;
  if (v == null || v === '') return null;
  const s = String(v).trim().toLowerCase();
  if (s === 'true' || s === 'yes' || s === '1' || s === 'a+') return true;
  if (s === 'false' || s === 'no' || s === '0') return false;
  return null;
}

function nullishStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function walkStrings(value: unknown, path = 'process'): void {
  if (typeof value === 'string') {
    const max = path.endsWith('inviteBody')
      ? MAX_INVITE_BODY
      : path.endsWith('notes') ||
          path.endsWith('text') ||
          path.endsWith('comments') ||
          path.endsWith('footerNote')
        ? NOTE_MAX
        : STRING_MAX;
    if (value.length > max) throw new BidProcessError(`${path} exceeds ${max} characters`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkStrings(v, `${path}[${i}]`));
    return;
  }
  if (isPlainObject(value)) {
    for (const [k, v] of Object.entries(value)) walkStrings(v, `${path}.${k}`);
  }
}

function walkNumbers(value: unknown, path: string): void {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new BidProcessError(`${path} contains a non-finite number`);
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkNumbers(v, `${path}[${i}]`));
    return;
  }
  if (isPlainObject(value)) {
    for (const [k, v] of Object.entries(value)) walkNumbers(v, `${path}.${k}`);
  }
}

/** Static FE metadata: stages, field entry phase, HQ example. */
export function processMeta() {
  return {
    stages: PROCESS_STAGES.map((id) => ({
      id,
      label: STAGE_LABELS[id],
      who: STAGE_WHO[id],
    })),
    outcomes: OUTCOMES,
    lostOutcomes: LOST_OUTCOMES,
    handoffActions: HANDOFF_ACTIONS,
    workTypes: WORK_TYPES,
    bidKinds: BID_KINDS,
    bidKindLabels: BID_KIND_LABELS,
    clearance: CLEARANCE_OPTIONS,
    tierRoles: TIER_ROLES,
    intakeEditor: INTAKE_EDITOR,
    setupEditor: SETUP_EDITOR,
    takeoffRoles: TAKEOFF_ROLES,
    dashboardPlates: dashboardPlatesMeta(),
    lostReasons: LOST_REASONS,
    attachmentLabels: PROCESS_ATTACHMENT_LABELS,
    specSheetTemplates: specSheetTemplatesMeta(),
    specSheetEditor: {
      ui: 'dependent-dropdowns',
      lookups: specSheetLookupsMeta(),
      filterByKind: ['systems'],
      filterSystemsBy: 'kind',
      filterMaterialsBy: ['family', 'layer'],
      materialsRequireFamily: true,
      codesNeverDropdown: true,
      codeSkip: true,
      mikeCodeEntry: {
        label: 'Mike code',
        placeholder: 'FGA',
        action: 'Go',
        query: 'GET /lookups/bidding/spec-materials?code=',
        loading: 'spinner on Mike code / Go until GET spec-materials?code= settles',
        note: 'Type the List code to fill the row. Not a dropdown. Not “skip this row”.',
      },
      layers: [
        { id: 1, field: 'materialName', factoryJacket: 'facing', note: 'What the factory sold + factory jacket (ASJ/FSK/none)' },
        { id: 2, field: 'jacket', note: 'Field-applied covering. Stainless is never layer 1. None is OK.' },
      ],
      cascade: [
        { pick: 'kind', filters: ['systems'], note: 'Duct | HVAC pipe | Plumbing | Equipment' },
        {
          pick: 'systemName',
          fills: ['systemCode', 'unit'],
          loading: 'spinner on System while GET spec-systems?kind= is in flight',
          note: 'Unit always shown (LF/SF)',
        },
        {
          pick: 'areaName',
          fills: ['areaCode'],
          loading: 'spinner on Area while GET spec-areas is in flight (cache after first)',
          note: 'Shared HVAC_Area list — not per system. Protection below is an area.',
        },
        { pick: 'insulationFamily', filters: ['materials'], note: 'Broad type first (fiberglass, elastomeric, …)' },
        {
          pick: 'materialName',
          fills: ['materialCode', 'facing', 'jacket', 'thicknessIn', 'weight'],
          uses: ['sizes', 'thicknesses'],
          loading: 'spinner on insulation while GET spec-materials?family=&layer=insulation is in flight',
          note: 'Products in that family. Or type Mike code (FGA) + Go to fill the row.',
        },
        {
          pick: 'facing',
          loading: 'spinner on Facing while GET spec-facings is in flight (cache after first)',
          note: 'Layer 1 factory jacket — spec-facings. Override only.',
        },
        { pick: 'jacket', note: 'Layer 2 field covering — specSheetEditor.coverings' },
        { pick: 'ductShape', when: 'kind=duct', note: 'Rectangular / square / round / oval' },
        {
          pick: 'sizeMin/sizeMax',
          loading: 'if you call spec-sizes / spec-thicknesses, spinner on size/thick until they settle; prefer sizes[] on the material row',
          note: 'Pipe = NPS. Duct = circumference buckets (often any). Equipment = usually blank.',
        },
        { pick: 'manufacturersAllowed', note: 'OC / JM / Knauf / Manson from the spec. Nick+PJ pick preferred.' },
        { pick: 'manufacturerPreferred', note: 'Bid-time override. Not cheapest. Not the takeoff guy.' },
        { pick: 'accessories', note: 'Pins / banding — submittal, not Mike price' },
        { pick: 'specSection/specParagraph', note: 'Where in the book (e.g. 2.6 noise barrier)' },
      ],
      loading: {
        rule: 'Spinner in the waiting cell. Disable that control until settled. Do not clear the pick that triggered the fetch.',
        fetches: [
          { pick: 'page', query: 'GET /bids/:id' },
          { pick: 'page', query: 'GET /lookups/bidding/process-meta' },
          { pick: 'systemName', query: 'GET /lookups/bidding/spec-systems?kind=' },
          { pick: 'areaName', query: 'GET /lookups/bidding/spec-areas' },
          { pick: 'materialName', query: 'GET /lookups/bidding/spec-materials?family=&layer=insulation' },
          { pick: 'mikeCode', query: 'GET /lookups/bidding/spec-materials?code=' },
          { pick: 'facing', query: 'GET /lookups/bidding/spec-facings' },
          { pick: 'sizeMin/sizeMax', query: 'GET /lookups/bidding/spec-sizes?code=' },
          { pick: 'thicknessIn', query: 'GET /lookups/bidding/spec-thicknesses?code=' },
          { pick: 'save', query: 'PATCH /bids/:id' },
          { pick: 'images', query: 'POST /bids/:id/attachments' },
        ],
        noFetch: [
          'kind',
          'insulationFamily',
          'jacket',
          'ductShape',
          'manufacturersAllowed',
          'manufacturerPreferred',
          'accessories',
          'specSection',
          'specParagraph',
          'notes',
        ],
      },
      sizes: [],
      thicknesses: [],
      sizeThicknessFrom: 'spec-materials-row',
      sizeModeByKind: SIZE_MODE_BY_KIND,
      ductShapes: DUCT_SHAPES,
      families: insulationFamiliesMeta(),
      coverings: SPEC_COVERINGS,
      manufacturers: SPEC_MANUFACTURERS,
      copyRow: true,
      stackSheets: true,
      confirmDeleteSheet: true,
      preferredFromAllowedOnly: true,
      defaultJacket: 'none',
      mikeSizeMin: MIKE_SIZE_MIN,
      mikeSizeMax: MIKE_SIZE_MAX,
      sizeRange: {
        min: MIKE_SIZE_MIN,
        max: MIKE_SIZE_MAX,
        fields: ['sizeMin', 'sizeMax', 'widthIn'],
        note: 'Size and width number inputs — 0 to 999. 999 = Mike and greater.',
      },
      sizeAll: { sizeMin: MIKE_SIZE_MIN, sizeMax: MIKE_SIZE_MAX, note: 'All pipe sizes — skip the size pick; 0–999 like Mike' },
      pasteSpecImage: 'specSheets[].imageAttachmentIds + POST /bids/:id/attachments label=spec-sheet-image',
      buyAmericanBeforeSheet: true,
      systemKindHints: SPEC_KIND_SYSTEM_HINTS,
      why: 'Family then product. Layer 1 insulation + factory jacket, layer 2 field cover. Duct uses circumference not pipe NPS. Equipment is its own kind. Manufacturer is who, not cheapest.',
    },
    bondClaimDays: BOND_CLAIM_DAYS,
    fields: PROCESS_FIELDS,
    hqExampleTiers: HQ_EXAMPLE_TIERS,
    defaults: {
      assignmentOwner: 'nick_pj_and_clerk',
      assignmentOwnerLabel: 'Nick + PJ + bid clerk (John) — queue must not sit',
      intakeMandatoryForHandoff: [
        'estimateNumber',
        'ourEntityId',
        'bidKind',
        'drawingsIfBuiltToPrintOrDesignAssist',
        'whoElseBiddingIfFewerThanTwoInvites',
      ],
      incompleteOk: true,
      specsPreparedBy: 'captain',
      technicalReviewBy: 'captain',
      takeoffAssignedBy: 'captain',
      equipmentAndVrfTeam: 'hydronic',
      proposalApproval: 'estimating_review',
      postBidOwner: 'follow_up_owner',
      awardRequiresOutcomeFirst: true,
      outcomeEditable: true,
      stagesLockedAfterComplete: false,
      notifications: false,
    },
    reuse: {
      bidHeader: ['estimateNumber', 'bidName', 'ourEntityId', 'jobId', 'submitDate', 'timeEstimate'],
      baseBid: ['pla', 'wageRateLabel', 'liftsNeeded', 'parking', 'ccipCoversWc', 'citizenProject', 'teamName'],
      attachments: 'POST /bids/:id/attachments with label from attachmentLabels',
      specSheets: 'PATCH process.specSheets — Setup dropdown rules. FRONTEND_SPEC_SHEET.md. Family → layer 1 → layer 2.',
      mikeFiles: 'POST /bids/:id/mike-files — versions kept, never deleted on re-upload',
      specs: 'GET /bids/:id/spec-lines — Takeoff stage screen (qty grid, not spec schedules)',
      estimate: 'baseBid / systems / computed — Proposal stage screen',
      production: 'existing production APIs — after awarded',
      teams: 'GET /lookups/bidding/teams',
    },
    notNow: ['bond auto-notice at day 89', 'notifications', 'replace Mike', 'handoff email notifications'],
  };
}

export const STAGE_LABELS: Record<ProcessStage, string> = {
  intake: 'Bid Intake',
  assignment: 'Bid Assignment',
  estimating_setup: 'Estimating Setup',
  takeoff: 'Takeoff & Estimate',
  proposal: 'Bid Review & Proposal',
  post_bid: 'Post-Bid / Intelligence',
  result: 'Outcome',
};

const STAGE_WHO: Record<ProcessStage, string> = {
  intake: 'Bid clerk — invitation info only; incomplete OK',
  assignment: 'Nick + PJ + bid clerk — bid/no-bid, team (1/2/3), takeoff plan',
  estimating_setup: 'Captain / estimator — wage, spec sheets, approve for takeoff',
  takeoff: 'Assigned takeoff — Mike/Specs; versions never overwritten',
  proposal: 'Estimating review — calculator, proposal versions, submit',
  post_bid: 'Follow-up — competitors, BAFO',
  result: 'Win / lose tab at the end of pre. Changeable. Post screens follow.',
};

type EntryPhase = ProcessStage | 'awarded' | 'lost' | 'later' | 'reuse';

const PROCESS_FIELDS: Array<{ path: string; phase: EntryPhase; note: string }> = [
  { path: 'workType', phase: 'intake', note: 'Insulation / Demo / GC / Masonry / Other' },
  { path: 'drawingName', phase: 'intake', note: 'Architect project name on drawings — this IS bidName. Not invitation subject.' },
  { path: 'ownerProjectNumber', phase: 'intake', note: 'Owner or architect project # on title block (duplicate key)' },
  { path: 'mechanicalEngineerProjectNumber', phase: 'intake', note: 'Engineer of Record — mechanical. Title-block # (second duplicate key)' },
  { path: 'invitationReceivedAt', phase: 'intake', note: 'Mirrored from invitations[0]. Multiple vendors → invitations[]' },
  { path: 'inviteContact', phase: 'intake', note: 'Mirrored from invitations[0]. Use invitations[] for more than one.' },
  { path: 'invitations', phase: 'intake', note: 'Add another invitation to THIS bid. Do not create a second bid. First mechanical+invite can match; later invites are extra mechanicals.' },
  { path: 'invitations.inviteBody', phase: 'intake', note: 'Paste the full invitation email / portal dump' },
  { path: 'invitations.contact.preferredContact', phase: 'intake', note: 'email | phone' },
  { path: 'owner.preferredContact', phase: 'intake', note: 'email | phone — same on architect / ME / invite contact' },
  { path: 'documentLinks.checkAddenda', phase: 'intake', note: 'True on the owner/federal link clerks should check for addenda' },
  { path: 'invitations.addenda', phase: 'intake', note: 'Which inviter sent addendum 2/3 — one of three may not tell us' },
  { path: 'whoElseBidding', phase: 'intake', note: 'Required to hand off when invitations.length < 2. Do not ask the inviter.' },
  { path: 'documentLinks', phase: 'intake', note: 'Owner/federal public set + extras. checkAddenda on the source-of-truth link.' },
  { path: 'projectAddress', phase: 'intake', note: 'Paste full line in line1 — city/state/zip fill if empty' },
  { path: 'bidKind', phase: 'intake', note: 'Mandatory. Budget is a kind — not a separate checkbox.' },
  { path: 'budgetOnly', phase: 'intake', note: 'Derived: true when bidKind=budget. Do not show as its own field.' },
  { path: 'relatedBidId', phase: 'intake', note: 'Rebid / prior job — click through. Do not duplicate the project.' },
  { path: 'notes', phase: 'later', note: 'Deprecated pad. Notes drawer is GET/POST /bids/:id/comments. Invite paste is invitations[].inviteBody.' },
  { path: 'dueDate', phase: 'intake', note: '' },
  { path: 'dueTime', phase: 'intake', note: '' },
  { path: 'owner', phase: 'intake', note: 'From drawings' },
  { path: 'architect', phase: 'intake', note: 'From drawings' },
  { path: 'mechanicalEngineer', phase: 'intake', note: 'From drawings' },
  { path: 'contractTiers', phase: 'intake', note: 'Sketch ~5 layers on intake. hasTheJob / invitedUs / isPaying. Bonds confirm at award.' },
  { path: 'generalContractors', phase: 'intake', note: 'Multiple GCs on the same opportunity; hasTheJob / stillBidding' },
  { path: 'mechanicals', phase: 'intake', note: 'Multiple mechanicals on the same opportunity; hasTheJob / stillBidding' },
  { path: 'assignment', phase: 'assignment', note: 'Nick+PJ+clerk. teamId from /lookups/bidding/teams. pursue false = no-bid on complete' },
  { path: 'takeoffAssignments', phase: 'assignment', note: 'Who does each scope; 1 or 2 for back-check. VRF + equipment = hydronic team' },
  { path: 'constructionType', phase: 'estimating_setup', note: 'Followup building bucket — GET /lookups/bidding/building-types; save name' },
  { path: 'constructionSubtype', phase: 'estimating_setup', note: 'GET /lookups/bidding/project-types' },
  { path: 'mbePreference', phase: 'estimating_setup', note: 'GET /lookups/bidding/preferences' },
  { path: 'entityRule', phase: 'estimating_setup', note: 'Suggests Goel DC / DCB / Goel Services' },
  { path: 'pla', phase: 'estimating_setup', note: 'Also on baseBid.pla — keep in sync in UI' },
  { path: 'wageDecisionId', phase: 'estimating_setup', note: 'Lookup Bid_WageDecisions — not Bid_WageRates' },
  { path: 'clearance', phase: 'estimating_setup', note: 'US citizen / US person / Real ID' },
  { path: 'labor', phase: 'estimating_setup', note: '' },
  { path: 'ocipCcip', phase: 'estimating_setup', note: 'GL = no price impact; WC = downward' },
  { path: 'buyAmerican', phase: 'estimating_setup', note: 'Project-level, before spec sheet. Federal work. Filters manufacturers.' },
  { path: 'aPlus', phase: 'estimating_setup', note: 'Setup page checkbox. Bid-level, not a spec-sheet column.' },
  { path: 'lifts', phase: 'estimating_setup', note: 'Reuse baseBid.liftsNeeded for money math' },
  { path: 'parking', phase: 'estimating_setup', note: 'Reuse baseBid.parking* for money math' },
  { path: 'schedule', phase: 'estimating_setup', note: '' },
  { path: 'insulationSpecs', phase: 'estimating_setup', note: 'Which spec types apply (flags). Tables are specSheets.' },
  { path: 'specSheets', phase: 'estimating_setup', note: 'Spec rules rows (dropdowns). Before takeoff. Not the qty grid.' },
  { path: 'technicalReview', phase: 'estimating_setup', note: 'approvedForTakeoff required to hand off' },
  { path: 'takeoffAssignments.versions', phase: 'takeoff', note: 'Never overwrite; new version each revision' },
  { path: 'amendments', phase: 'proposal', note: '+ Add; arrays replace on PATCH' },
  { path: 'estimateReview', phase: 'proposal', note: '' },
  { path: 'proposalVersions', phase: 'proposal', note: 'BAFO / VE / scope change flags' },
  { path: 'submission', phase: 'proposal', note: '' },
  { path: 'intelligence', phase: 'post_bid', note: 'Follow-up + competitors + source + confidence' },
  { path: 'outcome', phase: 'result', note: 'Last pre tab. Win/lose — change anytime' },
  { path: 'award', phase: 'awarded', note: 'POST block only if workflow.showAward. Survives outcome change.' },
  { path: 'startup', phase: 'awarded', note: 'POST block. Confirm leftover startup; same bid' },
  { path: 'contractTiers.bonds', phase: 'awarded', note: 'Same contractTiers array — fill bond # / notice at award' },
  { path: 'lost', phase: 'lost', note: 'POST block only if workflow.showLost. Change outcome to switch.' },
  { path: 'bond', phase: 'later', note: 'last labor + 90-day due. No auto notice yet' },
  { path: 'breadcrumbs', phase: 'intake', note: 'Running log; handoff also writes Bid_ActivityLog' },
];

const TIER_BLANK: Omit<ContractTier, 'sortOrder' | 'role' | 'company' | 'isBonded'> = {
  relationship: null,
  contactName: null,
  projectManager: null,
  superintendent: null,
  foreman: null,
  email: null,
  phone: null,
  bondNumber: null,
  bondingCompany: null,
  noticeTo: null,
  hasTheJob: null,
  invitedUs: null,
  isPaying: null,
};

/** HQ 21247 / 21437-style stack from the PJ call. sortOrder 0 = top of tree. */
export const HQ_EXAMPLE_TIERS: ContractTier[] = [
  { sortOrder: 0, role: 'owner', company: 'US Government', isBonded: false, ...TIER_BLANK },
  { sortOrder: 1, role: 'cm', company: 'US Army Corps of Engineers', isBonded: false, ...TIER_BLANK },
  { sortOrder: 2, role: 'gc', company: 'Clark Construction', isBonded: true, ...TIER_BLANK },
  { sortOrder: 3, role: 'first_tier', company: 'Kogok Sheet Metal', isBonded: true, ...TIER_BLANK },
  { sortOrder: 4, role: 'mechanical', company: 'Heritage Mechanical', isBonded: false, ...TIER_BLANK },
  { sortOrder: 5, role: 'us', company: 'Goel', isBonded: false, ...TIER_BLANK },
];

const BID_KIND_LABELS: Record<BidKind, string> = {
  built_to_print: 'Build to print',
  design_build: 'Design build',
  design_assist: 'Design assist',
  budget: 'Budget pricing',
  unknown: 'Unknown',
  other: 'Other',
};

const INTAKE_EDITOR = {
  bidNameFrom: 'drawingName',
  bidNameNote: 'Architect name on the drawings. Not the invitation subject. Not a nickname.',
  budgetIsBidKind: true,
  hideBudgetOnlyField: true,
  projectNumbers: ['ownerProjectNumber', 'mechanicalEngineerProjectNumber'] as const,
  duplicateSearch: 'GET /bids?search=&ownerProjectNumber=&mechanicalEngineerProjectNumber=',
  invitations: 'invitations[] — company first, then that company\'s contact; never a second bid',
  inviteCompanyFirst: true,
  eorLabel: 'Engineer of Record — mechanical',
  eorField: 'mechanicalEngineerProjectNumber',
  documentLinks: 'documentLinks[] — owner/federal public set plus extras; mark checkAddenda for addendum source',
  relatedBid: 'relatedBidId — click through to the prior bid',
  linkDuplicate: 'POST /bids/:id/link-duplicate { keepBidId } — merge invites onto keep, close this one',
  whoElseBidding: 'whoElseBidding.researched required when invitations.length < 2. Call GC — not the inviter.',
  drawingsRequiredFor: ['built_to_print', 'design_assist'] as const,
  bidNameLockedToDrawingName: true,
  projectNumberStripsHash: true,
  jobIdOnIntake: 'skip_until_awarded',
  hideJobIdOnIntake: true,
  fillAddressFromLine1: true,
  preferredContact: {
    replaceUi: 'Contact',
    label: 'Preferred contact',
    ui: 'dropdown',
    bind: 'contact.preferredContact',
    options: [
      { value: 'email', label: 'Email', show: 'contact.email' },
      { value: 'phone', label: 'Phone', show: 'contact.phone' },
    ],
    showSelected: 'contact.preferredContactValue',
  },
  inviteBody: 'invitations[].inviteBody — paste the email',
  checkAddenda: 'documentLinks[].checkAddenda',
  tiersOnIntake: true,
  assignmentOwners: 'Nick + PJ + bid clerk',
  teamField: 'assignment.teamId',
  teamLookup: 'GET /lookups/bidding/teams',
  partiesLookup: 'GET /lookups/bidding/parties?role=owner|architect|mechanical|invite_contact&q=&page=1&pageSize=10',
  partyRoles: INTAKE_PARTY_ROLES,
  sketchTiers: [
    { sortOrder: 0, role: 'owner', note: 'Who owns the property' },
    { sortOrder: 1, role: 'lessee', note: 'Who pays if not the owner — skip if owner pays' },
    { sortOrder: 2, role: 'gc', note: 'Or cm — who they hired. Optional.' },
    { sortOrder: 3, role: 'mechanical', note: 'Skip if hired by GC/owner/us' },
    { sortOrder: 4, role: 'us', note: 'Goel' },
  ],
  doNot: [
    'Create a second bid when another invitation arrives for the same drawings',
    'Let the clerk freely rename the bid',
    'Show budget as a checkbox next to bid type',
    'Ask the inviter who else is bidding',
    'Put Division / Project type fields — values were not locked; use workType',
    'Require jobId / linked job on intake — wait until awarded',
    'Clear line1 after filling city/state/zip from a pasted address',
  ],
};

/** Estimating Setup — Followup buckets already in Bid_BuildingTypes / Bid_ProjectTypes / Bid_Preferences. */
const SETUP_EDITOR = {
  constructionType: {
    bind: 'constructionType',
    lookup: 'GET /lookups/bidding/building-types',
    note: 'Followup CRM building buckets. Save the name. Do not invent new ones.',
  },
  constructionSubtype: {
    bind: 'constructionSubtype',
    lookup: 'GET /lookups/bidding/project-types',
  },
  mbePreference: {
    bind: 'mbePreference',
    lookup: 'GET /lookups/bidding/preferences',
  },
  pla: 'process.pla',
  buyAmerican: 'process.buyAmerican',
  aPlus: 'process.aPlus',
  specSheet: 'FRONTEND_SPEC_SHEET.md',
};
