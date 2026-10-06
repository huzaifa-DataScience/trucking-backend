/**
 * Self-check: PDF workflow merge, handoff, outcome gate, takeoff compare, DC/MD, bond.
 * Usage: npx ts-node scripts/check-bid-process.ts
 */
import {
  BOND_CLAIM_DAYS,
  HQ_EXAMPLE_TIERS,
  absorbIntake,
  applyHandoff,
  applyOutcome,
  claimDueDate,
  classifyInsulationFamily,
  classifySpecLayer,
  diffProcessChangePaths,
  emptyProcess,
  fillTakeoffAssignmentsFromTeam,
  humanizeProcessPath,
  fillProjectAddress,
  intakeCompleteBlocked,
  mergeProcess,
  parseUsAddress,
  normalizeProjectNumber,
  ourTierIndex,
  parseProcess,
  intakePartiesFromProcess,
  partyDedupeKey,
  processMeta,
  specSheetTemplate,
  suggestOurEntity,
  takeoffComparisons,
  workflowChrome,
  takeoffTurnInFrom,
  parseEstimatesFilterKeys,
  resolveAttachmentCategory,
  chromeTabPills,
} from '../src/bidding/process/bid-process';
import { bindAssignmentCrew, EXCEL_BID_TEAMS, excelRosterContacts, indexPeopleByName, lookupPersonByName, mergeBiddingContacts, parseCrewJson, resolveEstimatesTeamId, TEAM_CREW_SLOTS, teamBelongsToCaptain, useInternalBidList } from '../src/bidding/process/bid-crew';
import {
  bidListLastPage,
  bidListPageWindow,
  defaultBidListSortDir,
  foldBidListStatusCounts,
  parseBidListPage,
  parseBidListPageSize,
  parseBidListSort,
  parseBidListSortDir,
} from '../src/bidding/bid-list-page';
import {
  BID_LIST_EXCEL_COLUMNS,
  bidListExcelRow,
  canEditBid,
  dueBucket,
  fillPlateGroups,
  isNewBid,
  plateCalendarDate,
  plateForRole,
  todayYmd,
} from '../src/bidding/process/bid-plate';
import { APP_ROLE_IDS } from '../src/auth/rbac-catalog';
import {
  fillSpecSheetCodes,
  implyMaterialFields,
  parseFamilyQuery,
  specMaterialsQueryEmpty,
} from '../src/bidding/process/spec-sheet';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

function readyIntake(over: Record<string, unknown> = {}) {
  return mergeProcess(emptyProcess(), {
    bidKind: 'budget',
    invitations: [
      { receivedAt: '2026-08-20', contact: { name: 'Pat' } },
      { receivedAt: '2026-08-21', contact: { name: 'Bowers' } },
    ],
    ...over,
  });
}

const merged = mergeProcess(emptyProcess(), {
  workType: 'insulation',
  stage: 'first_input',
  owner: { name: 'DIA' },
  amendments: [{ number: 1, date: '2026-08-01', drawingsChanged: true }],
});
assert(merged.workType === 'insulation', 'workType merge');
assert(merged.stage === 'intake', 'legacy first_input → intake');
assert(merged.outcome === 'open', 'default outcome open');
assert(merged.owner.name === 'DIA', 'nested owner merge');
assert(merged.owner.email === null, 'nested owner keeps empty keys');
assert(merged.amendments.length === 1 && merged.amendments[0].drawingsChanged === true, 'array replace');

const replaced = mergeProcess(merged, { amendments: [{ number: 2, date: null }] });
assert(replaced.amendments.length === 1 && replaced.amendments[0].number === 2, 'amendments replace not concat');

assert(suggestOurEntity({ ...emptyProcess().entityRule, jurisdiction: 'dc' }) === 'goel_dc', 'DC → Goel DC');
assert(
  suggestOurEntity({
    ...emptyProcess().entityRule,
    jurisdiction: 'md',
    isBaltimore: true,
    prevailingWage: true,
  }) === 'dcb',
  'MD Baltimore → DCB',
);
assert(
  suggestOurEntity({ ...emptyProcess().entityRule, jurisdiction: 'md', isPrivateOrFederal: true }) ===
    'goel_services',
  'MD private/federal → Goel Services',
);

const withRule = mergeProcess(emptyProcess(), { entityRule: { jurisdiction: 'dc', isGovernment: true } });
assert(withRule.entityRule.suggestedOurEntity === 'goel_dc', 'merge fills suggestedOurEntity');

assert(claimDueDate('2026-01-01', true) === '2026-04-01', `${BOND_CLAIM_DAYS}-day window`);
assert(claimDueDate('2026-01-01', false) === null, 'no claim if not government');
const withBond = mergeProcess(emptyProcess(), {
  bond: { governmentOwned: true, lastLaborDate: '2026-06-15' },
});
assert(withBond.bond.claimDueDate === '2026-09-13', 'claimDueDate filled on merge');

assert(ourTierIndex(HQ_EXAMPLE_TIERS) === 5, 'HQ example: we are 6th layer (index 5)');
assert(HQ_EXAMPLE_TIERS.filter((t) => t.isBonded).map((t) => t.company).join(',') === 'Clark Construction,Kogok Sheet Metal', 'bonded layers');

let threw = false;
try {
  mergeProcess(emptyProcess(), { stage: 'nope' });
} catch {
  threw = true;
}
assert(threw, 'invalid stage rejected');

threw = false;
try {
  mergeProcess(emptyProcess(), { award: { jobNumber: '21437' } });
} catch {
  threw = true;
}
assert(!threw, 'award fields may save; FE hides until outcome = awarded');

const awarded = mergeProcess(emptyProcess(), { outcome: 'awarded', award: { jobNumber: '21437' } });
assert(awarded.outcome === 'awarded' && awarded.award.jobNumber === '21437', 'award allowed after outcome');

const switched = applyOutcome(awarded, 'lost');
assert(switched.outcome === 'lost' && switched.stage === 'result', 'outcome is changeable');
assert(switched.award.jobNumber === '21437', 'award data kept when switching to lost');
assert(workflowChrome(switched).showAward === false && workflowChrome(switched).showLost === true, 'post UI follows current outcome');
assert(workflowChrome(switched).outcomeEditable === true, 'outcome stays editable');

threw = false;
try {
  mergeProcess(emptyProcess(), { lost: { winningPrice: 1 } });
} catch {
  threw = true;
}
assert(!threw, 'lost fields may save; FE hides until a lost-like outcome');

const lost = mergeProcess(emptyProcess(), {
  outcome: 'lost',
  lost: { winningPrice: 100, ourFinalPrice: 120, reason: 'price' },
});
assert(lost.lost.difference === -20, 'lost difference filled');

const handed = applyHandoff(readyIntake(), 'complete');
assert(handed.stage === 'assignment', 'intake complete → assignment');
const back = applyHandoff(handed, 'return');
assert(back.stage === 'intake', 'return to intake');

threw = false;
try {
  applyHandoff(emptyProcess(), 'return');
} catch {
  threw = true;
}
assert(threw, 'cannot return from intake');

const noBid = applyHandoff(
  mergeProcess(emptyProcess(), { stage: 'assignment', assignment: { pursue: false } }),
  'complete',
);
assert(noBid.outcome === 'no_bid' && noBid.stage === 'result', 'assignment no-bid → Outcome tab');

const toSetupOpen = applyHandoff(mergeProcess(emptyProcess(), { stage: 'assignment' }), 'complete');
assert(toSetupOpen.stage === 'estimating_setup', 'assignment complete does not need approvedForTakeoff');

const toSetup = applyHandoff(
  mergeProcess(emptyProcess(), {
    stage: 'assignment',
    technicalReview: { approvedForTakeoff: true },
  }),
  'complete',
);
assert(toSetup.stage === 'estimating_setup', 'assignment → setup');

threw = false;
try {
  applyHandoff(mergeProcess(emptyProcess(), { stage: 'estimating_setup' }), 'complete');
} catch {
  threw = true;
}
assert(threw, 'setup → takeoff requires approvedForTakeoff');

const toTakeoff = applyHandoff(
  mergeProcess(emptyProcess(), {
    stage: 'estimating_setup',
    technicalReview: { approvedForTakeoff: true },
  }),
  'complete',
);
assert(toTakeoff.stage === 'takeoff', 'approved setup → takeoff');

const atPost = mergeProcess(emptyProcess(), { stage: 'post_bid' });
assert(applyHandoff(atPost, 'complete').stage === 'result', 'post-bid complete → Outcome tab');

threw = false;
try {
  applyHandoff(mergeProcess(emptyProcess(), { stage: 'result' }), 'complete');
} catch {
  threw = true;
}
assert(threw, 'already on Outcome — change win/lose, do not hand off');

const afterWin = applyHandoff(readyIntake({ outcome: 'awarded' }), 'complete');
assert(afterWin.stage === 'assignment' && afterWin.outcome === 'awarded', 'pre handoff still works after win');

const chrome = workflowChrome(readyIntake());
assert(chrome.showAward === false && chrome.showLost === false && chrome.canComplete === true, 'intake chrome');
assert(workflowChrome(emptyProcess()).canComplete === false, 'empty intake cannot complete');
assert(chrome.showOutcomeTab === true, 'outcome tab always in pre chrome');
assert(workflowChrome(awarded).showAward === true, 'awarded shows award screen');
assert(workflowChrome(lost).showLost === true, 'lost shows lost screen');

const comps = takeoffComparisons([
  { role: 'duct1', assigneeName: 'A', assignedAt: null, dueAt: null, status: null, hoursSpent: null, notes: null, finalQuantity: null, reviewedBy: null, completed: null, versions: [{ version: 1, createdBy: null, createdAt: null, reason: null, quantity: 100, hoursSpent: null, csvAttachmentId: null, pdfAttachmentId: null }] },
  { role: 'duct2', assigneeName: 'B', assignedAt: null, dueAt: null, status: null, hoursSpent: null, notes: null, finalQuantity: null, reviewedBy: null, completed: null, versions: [{ version: 1, createdBy: null, createdAt: null, reason: null, quantity: 110, hoursSpent: null, csvAttachmentId: null, pdfAttachmentId: null }] },
]);
assert(comps[0].difference === 10 && comps[0].reconciliationRequired === true, 'duct1 vs duct2 compare');

assert(applyOutcome(emptyProcess(), 'awarded').outcome === 'awarded', 'set outcome');

const legacyAward = parseProcess({ stage: 'awarded' });
assert(legacyAward.stage === 'post_bid' && legacyAward.outcome === 'awarded', 'legacy awarded stage → outcome');

const roundTrip = parseProcess(JSON.parse(JSON.stringify(withRule)));
assert(roundTrip.entityRule.jurisdiction === 'dc', 'parseProcess round-trip');
assert(roundTrip.outcome === 'open', 'round-trip keeps open when award is empty');

const duct = specSheetTemplate('duct');
assert(duct.kind === 'duct' && duct.rows.length === 6, 'duct template empty rows');
assert(duct.rows[0].systemName === null, 'template rows start empty');
assert(specSheetTemplate('equipment').kind === 'equipment', 'equipment sheet kind');
assert(classifyInsulationFamily('Fiberglass with ASJ') === 'fiberglass', 'family fiberglass');
assert(classifyInsulationFamily('Foamglas') === 'foamglas', 'family foamglas');
assert(classifySpecLayer('PVC Coverings no Inserts') === 'covering', 'pvc is layer 2');
assert(classifySpecLayer('Fiberglass with ASJ') === 'insulation', 'fga is layer 1');
assert(parseFamilyQuery('fiberglass') === 'fiberglass', 'family query id');
assert(parseFamilyQuery('Fiberglass') === 'fiberglass', 'family query label');
assert(parseFamilyQuery('Mineral wool') === 'mineral_wool', 'family query mineral wool label');
assert(specMaterialsQueryEmpty({}), 'bare materials GET is empty');
assert(specMaterialsQueryEmpty({ family: 'nope' }), 'unknown family is empty not the full list');
assert(!specMaterialsQueryEmpty({ family: 'fiberglass' }), 'family unlocks materials');
assert(!specMaterialsQueryEmpty({ code: 'FGA' }), 'code skip does not need family');

const withSheet = mergeProcess(emptyProcess(), {
  specSheets: [
    {
      id: 'sheet-1',
      kind: 'plumbing',
      title: 'Plumbing Piping Insulation Schedule',
      specNumber: '220719',
      rows: [
        {
          id: 'r1',
          systemName: 'Domestic Hot Water',
          areaName: 'Interior',
          sizeMin: 0,
          sizeMax: 1.5,
          materialName: 'Fiberglass',
          thicknessIn: 1,
          facing: 'ASJ',
          jacket: 'PVC',
          notes: null,
        },
      ],
      footerNote: '*Underground piping not insulated.',
      imageAttachmentIds: [42],
    },
  ],
});
assert(withSheet.specSheets[0].rows[0].sizeMax === 1.5, 'spec row size saved');
assert(parseProcess(JSON.parse(JSON.stringify(withSheet))).specSheets[0].kind === 'plumbing', 'spec sheet round-trip');

const prefOk = mergeProcess(emptyProcess(), {
  specSheets: [
    {
      id: 'mfr',
      kind: 'plumbing',
      rows: [
        {
          id: 'r1',
          manufacturersAllowed: ['owens_corning', 'certainteed'],
          manufacturerPreferred: 'certainteed',
          sizeMin: 0,
          sizeMax: 999,
        },
      ],
    },
  ],
});
assert(prefOk.specSheets[0].rows[0].manufacturerPreferred === 'certainteed', 'preferred in allowed kept');
assert(prefOk.specSheets[0].rows[0].sizeMax === 999, 'Mike 999 sizeMax');
const prefDrop = mergeProcess(emptyProcess(), {
  specSheets: [
    {
      id: 'mfr2',
      kind: 'plumbing',
      rows: [{ id: 'r1', manufacturersAllowed: ['owens_corning'], manufacturerPreferred: 'johns_manville' }],
    },
  ],
});
assert(prefDrop.specSheets[0].rows[0].manufacturerPreferred === null, 'preferred not in allowed dropped');

const fg = implyMaterialFields('Fiberglass with ASJ');
assert(fg.facing === 'ASJ' && fg.thicknessIn == null, 'pipe material facing from name');
const wrap = implyMaterialFields('2" 3/4lb Duct Wrap');
assert(wrap.thicknessIn === 2 && wrap.weight === 0.75, 'duct name encodes thick+wt');
const board = implyMaterialFields('1.5" 3lb Board FSK w/Canvas');
assert(board.facing === 'FSK' && board.jacket === 'Canvas' && board.weight === 3, 'duct board finish');

const codeSheet = specSheetTemplate('plumbing');
codeSheet.id = 'codes-1';
codeSheet.rows[0].systemName = 'Domestic Hot Water';
codeSheet.rows[0].areaName = 'Exposed';
codeSheet.rows[0].materialName = 'Fiberglass with ASJ';
const filled = fillSpecSheetCodes([codeSheet], {
  systems: [{ kind: 'plumbing', systemName: 'Domestic Hot Water', code: 'DHW', unit: 'LF' }],
  areas: [{ areaName: 'Exposed', code: 'E' }],
  materials: [
    {
      kind: 'plumbing',
      description: 'Fiberglass with ASJ',
      code: 'FGA',
      facing: 'ASJ',
      jacket: null,
      thicknessIn: null,
      weight: null,
    },
  ],
});
assert(filled[0].rows[0].systemCode === 'DHW', 'system code auto');
assert(filled[0].rows[0].insulationFamily === 'fiberglass', 'family from material');
assert(filled[0].rows[0].sizeMode === 'nps', 'pipe size mode');
assert(filled[0].rows[0].unit === 'LF', 'unit auto');
assert(filled[0].rows[0].areaCode === 'E', 'area code auto');
assert(filled[0].rows[0].materialCode === 'FGA', 'material code auto');
assert(filled[0].rows[0].facing === 'ASJ', 'facing auto from material');

const trimbleNamed = specSheetTemplate('plumbing');
trimbleNamed.id = 'codes-2';
trimbleNamed.rows[0].materialName = '5.8" X 1" ASJ John Manville (JM) Fiberglass Pipe Covering (PC)';
const filledTrimble = fillSpecSheetCodes([trimbleNamed], {
  systems: [],
  areas: [],
  materials: [
    {
      kind: 'plumbing',
      description: 'Fiberglass with ASJ',
      code: 'FGA',
      facing: 'ASJ',
      jacket: null,
      thicknessIn: null,
      weight: null,
    },
  ],
  helpers: [{ specPhrase: 'Fiberglass with ASJ', keyword: 'fiberglass' }],
});
assert(filledTrimble[0].rows[0].materialCode === 'FGA', 'Trimble SKU name still fills FGA');

const skipCode = specSheetTemplate('plumbing');
skipCode.id = 'skip-code';
skipCode.rows[0].materialCode = 'FGA';
const filledSkip = fillSpecSheetCodes([skipCode], {
  systems: [],
  areas: [],
  materials: [
    {
      kind: 'plumbing',
      description: 'Fiberglass with ASJ',
      code: 'FGA',
      facing: 'ASJ',
      jacket: null,
      thicknessIn: null,
      weight: null,
    },
  ],
});
assert(filledSkip[0].rows[0].materialName === 'Fiberglass with ASJ', 'code skip fills name');
assert(filledTrimble[0].rows[0].sizeMin === 5.8, 'size parsed from Trimble name');
assert(filledTrimble[0].rows[0].thicknessIn === 1, 'thickness parsed from Trimble name');

const legacyGrid = mergeProcess(emptyProcess(), {
  specSheets: [{ id: 'old', template: 'duct', cells: [['A', 'B']], merges: [{ r: 0, c: 0, rowspan: 2, colspan: 1 }] }],
});
assert(legacyGrid.specSheets[0].kind === 'duct' && legacyGrid.specSheets[0].rows.length === 6, 'legacy fortune grid → empty rules');

threw = false;
try {
  mergeProcess(emptyProcess(), {
    specSheets: [{ id: 'x', kind: 'plumbing', rows: [{ id: 'a', sizeMin: 4, sizeMax: 1 }] }],
  });
} catch {
  threw = true;
}
assert(threw, 'sizeMax < sizeMin rejected');

const clampedSize = mergeProcess(emptyProcess(), {
  specSheets: [{ id: 'x', kind: 'hydronic', rows: [{ id: 'a', sizeMin: 0, sizeMax: 5000, widthIn: 120 }] }],
});
assert(clampedSize.specSheets[0].rows[0].sizeMin === 0, 'size min 0 kept');
assert(clampedSize.specSheets[0].rows[0].sizeMax === 999, 'size max clamped to 999');
assert(clampedSize.specSheets[0].rows[0].widthIn === 120, 'width stored');

threw = false;
try {
  mergeProcess(emptyProcess(), {
    specSheets: [
      { id: 'dup', kind: 'duct', rows: [] },
      { id: 'dup', kind: 'plumbing', rows: [] },
    ],
  });
} catch {
  threw = true;
}
assert(threw, 'duplicate spec sheet id rejected');

const meta = processMeta();
assert(meta.specSheetTemplates.some((t: { id: string }) => t.id === 'hydronic'), 'process-meta templates');
assert(meta.specSheetTemplates.some((t: { id: string }) => t.id === 'equipment'), 'equipment template');
assert(meta.specSheetEditor.ui === 'dependent-dropdowns', 'dropdown editor');
assert(meta.specSheetEditor.codesNeverDropdown === true, 'codes are not dropdowns');
assert(meta.specSheetEditor.codeSkip === true, 'estimators may type the Mike code');
assert(meta.specSheetEditor.mikeCodeEntry.label === 'Mike code', 'column is Mike code not Skip');
assert(meta.specSheetEditor.filterByKind.includes('systems'), 'systems filter by kind');
assert(!meta.specSheetEditor.filterByKind.includes('materials'), 'insulation list is not filtered by sheet kind');
assert(meta.specSheetEditor.filterMaterialsBy.includes('family'), 'materials filter by family');
assert(meta.specSheetEditor.materialsRequireFamily === true, 'do not dump the full insulation list');
assert(
  meta.specSheetEditor.cascade.some(
    (s: { pick?: string; loading?: string }) => s.pick === 'materialName' && !!s.loading,
  ),
  'insulation cell shows a loader while spec-materials is in flight',
);
assert(Array.isArray(meta.specSheetEditor.loading.fetches) && meta.specSheetEditor.loading.fetches.length >= 8, 'loading fetches listed');
assert(meta.specSheetEditor.mikeCodeEntry.loading, 'Mike code Go has a loader');
assert(meta.specSheetEditor.loading.noFetch.includes('insulationFamily'), 'family list is local — no spinner');
assert(meta.specSheetEditor.buyAmericanBeforeSheet === true, 'Buy American before spec table');
assert(meta.specSheetEditor.layers.length === 2, 'two layers');
assert(meta.specSheetEditor.copyRow === true, 'copy spec row');
assert(meta.specSheetEditor.stackSheets === true, 'stack sheets not add-tab');
assert(meta.specSheetEditor.confirmDeleteSheet === true, 'confirm before delete sheet');
assert(meta.specSheetEditor.preferredFromAllowedOnly === true, 'preferred from allowed');
assert(meta.specSheetEditor.mikeSizeMax === 999, 'Mike 999');
assert(meta.specSheetEditor.mikeSizeMin === 0, 'size min 0');
assert(meta.specSheetEditor.sizeRange.min === 0 && meta.specSheetEditor.sizeRange.max === 999, 'size/width 0–999');
assert(meta.specSheetEditor.sizeRange.fields.includes('widthIn'), 'width uses same range');
assert(meta.specSheetEditor.manufacturers.some((m: { value: string }) => m.value === 'certainteed'), 'CertainTeed');
assert(TEAM_CREW_SLOTS.includes('duct1') && TEAM_CREW_SLOTS.includes('bidClerk'), 'crew slots');
assert(parseCrewJson(null, null).duct1 === null, 'empty crew json');
assert(!('constructionType' in meta.setupEditor), 'building type left setup');
assert(meta.intakeEditor.constructionType.lookup.includes('building-types'), 'intake construction type = Followup buckets');
assert(meta.intakeEditor.impactedGsf.bind === 'impactedGsf', 'GSF on intake');
assert(meta.intakeEditor.baseBidPrice.bind === 'baseBidPrice', 'Base Bid $ on intake');
assert(meta.proposalEditor.readOnly.includes('baseBidPrice'), 'baseBidPrice RO on proposal');
assert(meta.proposalEditor.firstHere.includes('marginPercent'), 'proposal firstHere margin');
assert(meta.proposalEditor.firstHere.includes('systems'), 'proposal firstHere mike grid');
assert(meta.proposalEditor.alsoOnSetup.includes('pla'), 'PLA also Setup');
assert(meta.proposalEditor.readOnly.includes('assignment.captainUserId'), 'captain RO on proposal');
assert(mergeProcess(emptyProcess(), { impactedGsf: 120000 }).impactedGsf === 120000, 'impactedGsf');
assert(mergeProcess(emptyProcess(), { baseBidPrice: 47600 }).baseBidPrice === 47600, 'baseBidPrice');
assert(meta.defaults.equipmentAndVrfTeam === 'hydronic', 'VRF/equipment hydronic team');
assert(meta.specSheetEditor.sizeModeByKind.duct === 'circumference', 'duct uses circumference');
assert(Array.isArray(meta.specSheetEditor.sizes) && meta.specSheetEditor.sizes.length === 0, 'no global size list');
assert(Array.isArray(meta.specSheetEditor.thicknesses) && meta.specSheetEditor.thicknesses.length === 0, 'no global thick list');
assert(meta.attachmentLabels.includes('spec-sheet-image'), 'spec-sheet-image label');
assert(meta.attachmentLabels.includes('master-scan'), 'master-scan label');
assert(meta.drawingCategories.includes('cd'), 'CD drawing category');
assert(meta.attachmentMaxBytes === null, 'attachment max unlimited');
assert(meta.intakeEditor.hideBidClerk === true, 'hide bid clerk');
assert(meta.assignmentEditor.technicalReview === false, 'approve not on assignment');
assert(meta.setupEditor.technicalReview === true, 'approve on handoff');
assert(meta.setupEditor.label === 'Handoff', 'setup chrome is Handoff');
assert(meta.intakeEditor.hideDueDate === true, 'hide intake due date');
assert(meta.intakeEditor.clientBidDate.bind === 'bidDate', 'client bid date is header');
assert(meta.takeoffEditor.uploads.length === 1 && meta.takeoffEditor.uploads[0].label === 'takeoff', 'one takeoff drop');
assert(meta.takeoffEditor.oneDropZone === true, 'one drop zone');
assert(mergeProcess(emptyProcess(), { internalBidDate: '2026-10-02' }).internalBidDate === '2026-10-02', 'internalBidDate');
assert(meta.chromeTabs.map((t: { id: string }) => t.id).join() === 'intake,assignment,drawings,specs,handoff,takeoff,proposal,post_bid,result', 'mike tab order');
assert(meta.chromeTabs.find((t: { id: string; fromHub?: boolean }) => t.id === 'drawings')?.fromHub === true, 'drawings fromHub');
assert(meta.defaults.notifications === true, 'dashboard notifications live');
assert(meta.dashboardEditor.query === 'GET /dashboard', 'dashboard editor');
assert(meta.postBidEditor.stageId === 'post_bid', 'post-bid editor');
assert(meta.hubPick.drawings.labels.includes('drawings'), 'hub pick drawings');
assert(workflowChrome(readyIntake()).tabs.some((t) => t.id === 'intake' && t.pill === 'in_progress'), 'intake pill in progress');
assert(chromeTabPills(mergeProcess(emptyProcess(), { stage: 'takeoff' }), ['drawings']).find((t) => t.id === 'drawings')?.pill === 'complete', 'drawings complete with hub file');
assert(chromeTabPills(mergeProcess(emptyProcess(), { stage: 'takeoff' }), []).find((t) => t.id === 'intake')?.pill === 'complete', 'prior stage complete');
assert(meta.estimatesListEditor.statusColumn.label === 'Current progress', 'list progress label');
assert(meta.estimatesListEditor.columns[0].bind === 'estimateNumber', 'list estimate # column');
assert(meta.attachmentLabels.includes('takeoff'), 'takeoff label');
assert(meta.takeoffEditor.uploads.length === 1, 'single takeoff upload');
assert(meta.chromeTabsByRole.assistant_estimator[0].id === 'internal', 'AE internal tab');
assert(meta.internalListEditor.columns.some((c: { bind: string }) => c.bind === 'takeoffTurnedIn'), 'internal turned-in col');
assert(useInternalBidList('assistant_estimator') === true, 'AE auto internal list');
assert(useInternalBidList('assistant_estimator', 'all') === false, 'AE view=all');
assert(useInternalBidList('captain') === false, 'captain not internal');
assert(useInternalBidList('admin', 'internal') === true, 'view=internal forces');
assert(takeoffTurnInFrom({ labels: ['takeoff'] }).takeoffTurnedIn, 'one file turns in');
assert(takeoffTurnInFrom({ labels: ['takeoff-zip'] }).takeoffTurnedIn, 'old zip still counts');
assert(takeoffTurnInFrom({ labels: [] }).takeoffTurnedIn === false, 'no files');
assert(
  takeoffTurnInFrom({
    labels: [],
    assignments: [
      { assigneeName: 'A', completed: true },
      { assigneeName: 'B', completed: true },
    ],
  }).takeoffTurnedIn === false,
  'scope ticks do not turn in',
);
assert(meta.takeoffEditor.hideCompleted === true, 'no scope turned-in on takeoff');
assert(parseEstimatesFilterKeys(['search', 'search', 'nope', 'captain']).join() === 'search,captain', 'filter keys');
assert(meta.estimatesListEditor.saveFilters.includes('estimatesFilterKeys'), 'save filters path');
assert(meta.attachmentCategories.includes('takeoff_markup'), 'markup bucket');
assert(meta.takeoffEditor.uploadCategory === 'takeoff_markup', 'takeoff default category');
assert(meta.takeoffEditor.markup.offline === true, 'markup offline');
assert(meta.takeoffEditor.internalBidDate.bind === 'internalBidDate', 'takeoff shows internal date');
assert(resolveAttachmentCategory(null, 'takeoff-zip') === 'takeoff_markup', 'zip infers markup');
assert(resolveAttachmentCategory(null, 'drawings') === 'project_documents', 'drawings infers docs');
assert(resolveAttachmentCategory('proposal', 'takeoff-zip') === 'proposal', 'explicit category wins');
assert(meta.estimatesListEditor.defaultView === 'list', 'list default');
assert(meta.estimatesListEditor.hideTiles === true, 'hide tiles');
assert(meta.estimatesListEditor.paging.when === 'page= present', 'list paging opt-in');
assert(meta.estimatesListEditor.paging.pageSizes.join() === '25,50,100', 'list page sizes');
assert(parseBidListPage(undefined) === undefined, 'no page → no envelope');
assert(parseBidListPage('') === undefined, 'empty page → no envelope');
assert(parseBidListPage('1') === 1, 'page 1');
assert(parseBidListPage('0') === 1, 'page 0 clamps');
assert(parseBidListPageSize('50') === 50 && parseBidListPageSize('30') === 25, 'pageSize allow-list');
assert(parseBidListSort('captain') === 'captain' && parseBidListSort('nope') === undefined, 'sort allow-list');
assert(parseBidListSortDir('desc') === 'DESC' && parseBidListSortDir('up') === undefined, 'sortDir');
assert(defaultBidListSortDir('bidDate') === 'ASC' && defaultBidListSortDir('updated') === 'DESC', 'default sortDir');
assert(bidListLastPage(342, 25) === 14 && bidListLastPage(0, 25) === 1, 'last page');
assert(bidListPageWindow({ total: 342, page: 20, pageSize: 25 }).page === 14, 'OOR page → last');
assert(bidListPageWindow({ total: 342, page: 20, pageSize: 25 }).empty === true, 'OOR items empty');
assert(bidListPageWindow({ total: 342, page: 2, pageSize: 25 }).skip === 25, 'page 2 offset');
assert(
  foldBidListStatusCounts([
    { status: 'draft', c: 200 },
    { status: 'submitted', c: 100 },
    { status: 'archived', c: 42 },
  ]).all === 342,
  'status counts all',
);

assert(meta.bidKinds.includes('design_assist') && meta.bidKinds.includes('budget'), 'bid kinds from PJ call');
assert(meta.bidKinds.includes('unknown'), 'unknown bid kind');
assert(meta.tierRoles.includes('lessee'), 'lessee tier');
assert(meta.intakeEditor.budgetIsBidKind === true, 'budget is a bid kind');
assert(meta.intakeEditor.bidNameFrom === 'drawingName', 'bid name from drawings');
assert(meta.intakeEditor.teamField === 'assignment.teamId', 'team from teams lookup');
assert(meta.intakeEditor.captainField === 'assignment.captainUserId', 'captain user id');
assert(meta.intakeEditor.captainLookup.includes('/lookups/bidding/captains'), 'captains lookup');
assert(meta.intakeEditor.captainSelectsTeam === true, 'captain pick fills team');
assert(meta.intakeEditor.partiesLookup.includes('/lookups/bidding/parties'), 'parties lookup');
assert(meta.intakeEditor.partiesLookup.includes('pageSize='), 'parties lookup paginated');
assert(meta.intakeEditor.partyRoles.includes('invite_contact'), 'invite_contact role');
assert(meta.intakeEditor.eorLabel.includes('Engineer of Record'), 'EOR label');
assert(meta.intakeEditor.inviteCompanyFirst === true, 'invite company first');

assert(mergeProcess(emptyProcess(), { buyAmerican: true }).buyAmerican === true, 'buy American flag');
assert(mergeProcess(emptyProcess(), { aPlus: true }).aPlus === true, 'Setup A+ flag');

assert(
  partyDedupeKey('mechanical', { name: 'WSP', company: null, contactName: null, email: 'a@wsp.com', phone: null }) ===
    'mechanical|wsp|a@wsp.com',
  'party dedupe',
);
assert(intakePartiesFromProcess(merged).some((x) => x.role === 'owner' && x.contact.name === 'DIA'), 'intake parties from process');

const budgeted = mergeProcess(emptyProcess(), { budgetOnly: true });
assert(budgeted.bidKind === 'budget' && budgeted.budgetOnly === true, 'budgetOnly → bidKind budget');
const kindBudget = mergeProcess(emptyProcess(), { bidKind: 'budget' });
assert(kindBudget.budgetOnly === true, 'bidKind budget → budgetOnly');

const invite = mergeProcess(emptyProcess(), {
  invitationReceivedAt: '2026-08-20',
  inviteContact: { name: 'Pat', email: 'pat@gc.com' },
});
assert(invite.invitations.length === 1 && invite.invitations[0].contact.email === 'pat@gc.com', 'legacy invite → invitations[0]');

const twoInvites = mergeProcess(invite, {
  invitations: [
    { receivedAt: '2026-08-20', contact: { name: 'Pat' }, links: [{ url: 'https://a.example', label: 'Pat set' }], attachmentIds: [1] },
    { receivedAt: '2026-08-21', contact: { name: 'Bowers' }, links: [], attachmentIds: [] },
  ],
});
assert(twoInvites.invitations.length === 2 && twoInvites.inviteContact.name === 'Pat', 'invitations replace; [0] mirrors contact');

const nums = mergeProcess(emptyProcess(), {
  drawingName: 'Weinberg USP 800 Pharmacy',
  ownerProjectNumber: 'C.480.19.1762',
  mechanicalEngineerProjectNumber: 'LW19-330-00',
  documentLinks: [{ url: 'https://owner.example/set', label: 'Owner', source: 'owner' }],
  assignment: { teamId: 2 },
  contractTiers: [{ sortOrder: 0, role: 'lessee', company: 'Tenant', hasTheJob: true, invitedUs: false, isPaying: true }],
});
assert(nums.ownerProjectNumber === 'C.480.19.1762', 'owner project #');
assert(nums.mechanicalEngineerProjectNumber === 'LW19-330-00', 'ME project #');
assert(nums.documentLinks[0].source === 'owner', 'document link');
assert(nums.assignment.teamId === 2, 'assignment.teamId');
assert(nums.contractTiers[0].role === 'lessee' && nums.contractTiers[0].isPaying === true, 'lessee paying tier');

threw = false;
try {
  mergeProcess(emptyProcess(), { bidKind: 'nope' });
} catch {
  threw = true;
}
assert(threw, 'invalid bidKind rejected');

assert(normalizeProjectNumber('#C.480.19.1762') === 'C.480.19.1762', 'strip hash');
assert(normalizeProjectNumber('  LW19 - 330 - 00 ') === 'LW19-330-00', 'strip spaces');
const hashed = mergeProcess(emptyProcess(), { ownerProjectNumber: '#7821-23' });
assert(hashed.ownerProjectNumber === '7821-23', 'project # stored without hash');

assert(intakeCompleteBlocked(emptyProcess(), false)?.includes('Bid type'), 'bid type required');
assert(
  intakeCompleteBlocked(mergeProcess(emptyProcess(), { bidKind: 'built_to_print', whoElseBidding: { researched: true } }), false)?.includes(
    'Drawings',
  ),
  'drawings required for build-to-print',
);
assert(
  intakeCompleteBlocked(mergeProcess(emptyProcess(), { bidKind: 'budget' }), true)?.includes('invitation'),
  'single-invite research required',
);
assert(
  intakeCompleteBlocked(readyIntake({ bidKind: 'built_to_print' }), true) === null,
  'ready intake + drawings ok',
);

threw = false;
try {
  applyHandoff(mergeProcess(emptyProcess(), { bidKind: 'built_to_print', whoElseBidding: { researched: true } }), 'complete');
} catch {
  threw = true;
}
assert(threw, 'handoff blocked without drawings');
assert(
  applyHandoff(
    mergeProcess(emptyProcess(), { bidKind: 'built_to_print', whoElseBidding: { researched: true } }),
    'complete',
    null,
    { hasDrawings: true },
  ).stage === 'assignment',
  'handoff with drawings',
);

const withAddenda = mergeProcess(emptyProcess(), {
  invitations: [
    {
      receivedAt: '2026-08-20',
      contact: { name: 'Pat' },
      addenda: [{ number: '2', receivedAt: '2026-08-22', attachmentIds: [9] }],
    },
  ],
});
assert(withAddenda.invitations[0].addenda[0].number === '2', 'per-invite addendum');

const absorbed = absorbIntake(
  mergeProcess(emptyProcess(), { drawingName: 'Keep Job', invitations: [{ contact: { name: 'A' } }] }),
  mergeProcess(emptyProcess(), {
    ownerProjectNumber: '#111',
    invitations: [{ contact: { name: 'B' } }],
  }),
);
assert(absorbed.invitations.length === 2 && absorbed.ownerProjectNumber === '111', 'absorb invites + number');
assert(absorbed.drawingName === 'Keep Job', 'absorb keeps drawing name');

assert(meta.intakeEditor.bidNameLockedToDrawingName === true, 'bid name locked');
assert(meta.intakeEditor.linkDuplicate.includes('link-duplicate'), 'link-duplicate in meta');
assert(meta.intakeEditor.jobIdOnIntake === 'skip_until_awarded', 'jobId skipped on intake');
assert(meta.intakeEditor.hideJobIdOnIntake === true, 'hide job picker on intake');
assert(meta.intakeEditor.fillAddressFromLine1 === true, 'paste address fills city/state/zip');
assert(meta.intakeEditor.preferredContact.ui === 'dropdown', 'preferred contact is dropdown');
assert(
  meta.intakeEditor.preferredContact.options.some((o: { value: string }) => o.value === 'email') &&
    meta.intakeEditor.preferredContact.options.some((o: { value: string }) => o.value === 'phone'),
  'preferred contact email/phone',
);
assert(meta.intakeEditor.inviteBody.includes('inviteBody'), 'invite body in meta');
assert(meta.intakeEditor.checkAddenda.includes('checkAddenda'), 'checkAddenda in meta');
assert(meta.intakeEditor.assignmentOwners.includes('Gino'), 'assignment owners include Gino');
assert(meta.intakeEditor.followupCrmIntake.additionalDetailsEditor === false, 'no additional-details editor');
assert(meta.intakeEditor.followupCrmIntake.salesActivitiesEditor === false, 'no sales-activities editor');
assert(meta.intakeEditor.followupCrmIntake.doNotNullWipe === true, 'do not null-wipe CRM blobs');
assert(
  meta.intakeEditor.followupCrmIntake.listStillReads.includes('grossSqFootage') &&
    meta.intakeEditor.followupCrmIntake.listStillReads.includes('cashExpense'),
  'list still reads FollowupCRM filter keys',
);
assert(
  meta.intakeEditor.followupCrmIntake.patchIgnored.includes('additionalDetails') &&
    meta.intakeEditor.followupCrmIntake.patchIgnored.includes('salesActivities'),
  'PATCH ignores CRM blobs',
);

const storedCrm = parseProcess({
  additionalDetails: { bidNumber: 'IVA-6379', cashExpense: 12.5, loginDate: '2026-01-01' },
  salesActivities: { siteVisit: '2026-09-01', bidDelivered: '2026-09-02' },
});
assert(storedCrm.additionalDetails.bidNumber === 'IVA-6379', 'parse still loads additionalDetails');
assert(storedCrm.salesActivities.siteVisit === '2026-09-01', 'parse still loads salesActivities');
const clientWipe = mergeProcess(
  storedCrm,
  {
    additionalDetails: { bidNumber: null, cashExpense: null, loginDate: null },
    salesActivities: { siteVisit: null, bidDelivered: null },
    bidKind: 'budget',
  },
  { fromClient: true },
);
assert(clientWipe.additionalDetails.bidNumber === 'IVA-6379', 'client PATCH cannot wipe additionalDetails');
assert(clientWipe.additionalDetails.cashExpense === 12.5, 'client PATCH cannot wipe cashExpense');
assert(clientWipe.salesActivities.siteVisit === '2026-09-01', 'client PATCH cannot wipe salesActivities');
assert(clientWipe.bidKind === 'budget', 'real process keys still merge');
const echoCrm = mergeProcess(
  storedCrm,
  {
    additionalDetails: storedCrm.additionalDetails,
    salesActivities: storedCrm.salesActivities,
    workType: 'insulation',
  },
  { fromClient: true },
);
assert(echoCrm.additionalDetails.bidNumber === 'IVA-6379', 'GET echo does not replace stored CRM');
assert(echoCrm.workType === 'insulation', 'echo still saves real fields');

const withDrawing = parseProcess({ drawingNumber: 'A-101' });
assert(withDrawing.drawingNumber === 'A-101', 'drawingNumber persists');
const takeoffFilled = mergeProcess(emptyProcess(), { takeoffAssignments: [] });
fillTakeoffAssignmentsFromTeam(takeoffFilled, { duct1: 'Wesley Morris', hydronic1: 'Jeremee Camat' });
assert(
  takeoffFilled.takeoffAssignments.some((a) => a.role === 'duct1' && a.assigneeName === 'Wesley Morris'),
  'takeoff fills from team',
);
assert(
  takeoffFilled.takeoffAssignments.some((a) => a.role === 'vrf' && a.assigneeName === 'Jeremee Camat'),
  'vrf follows hydronic1',
);
const procDiff = diffProcessChangePaths(
  parseProcess({ drawingNumber: 'A-101', additionalDetails: { bidNumber: 'X' } }),
  parseProcess({ drawingNumber: 'A-102', additionalDetails: { bidNumber: 'Y' } }),
);
assert(procDiff.includes('process.drawingNumber'), 'diff drawing number');
assert(!procDiff.some((p) => p.includes('additionalDetails')), 'diff skips additionalDetails');
assert(humanizeProcessPath('process.owner.company') === 'owner company', 'humanize path');
assert(meta.defaults.assignmentOwner === 'nick_pj_and_clerk', 'defaults assignment owner includes clerk');
assert(meta.stages.find((s: { id: string }) => s.id === 'assignment')?.who.includes('Gino'), 'assignment who includes Gino');

const parsedAddr = parseUsAddress('123 Main St, Baltimore, MD 21201');
assert(parsedAddr.city === 'Baltimore' && parsedAddr.state === 'MD' && parsedAddr.zip === '21201', 'parse US address');
const keptLine = fillProjectAddress({
  line1: '123 Main St, Baltimore, MD 21201',
  line2: null,
  city: null,
  state: null,
  zip: null,
});
assert(keptLine.line1 === '123 Main St, Baltimore, MD 21201', 'address fill keeps line1');
assert(keptLine.city === 'Baltimore' && keptLine.state === 'MD' && keptLine.zip === '21201', 'address fill city/state/zip');
const keepCity = fillProjectAddress({
  line1: '123 Main St, Baltimore, MD 21201',
  line2: null,
  city: 'Rockville',
  state: 'MD',
  zip: null,
});
assert(keepCity.city === 'Rockville' && keepCity.zip === '21201', 'address fill does not overwrite city');

const intakePj = mergeProcess(emptyProcess(), {
  projectAddress: { line1: '800 N Charles St, Baltimore, MD 21201' },
  owner: { name: 'JHU', email: 'a@jhu.edu', preferredContact: 'email' },
  documentLinks: [{ url: 'https://owner.example', label: 'Federal set', source: 'federal', checkAddenda: true }],
  invitations: [
    {
      receivedAt: '2026-08-20',
      contact: { name: 'Pat', phone: '301-555-0100', preferredContact: 'phone' },
      inviteBody: 'Hi — please bid Weinberg…',
    },
  ],
});
assert(intakePj.projectAddress.city === 'Baltimore' && intakePj.projectAddress.state === 'MD', 'PATCH address autofill');
assert(intakePj.owner.preferredContact === 'email' && intakePj.owner.preferredContactValue === 'a@jhu.edu', 'owner preferred shows email');
assert(
  intakePj.invitations[0].contact.preferredContact === 'phone' &&
    intakePj.invitations[0].contact.preferredContactValue === '301-555-0100',
  'invite preferred shows phone',
);
assert(intakePj.invitations[0].inviteBody === 'Hi — please bid Weinberg…', 'inviteBody stored');
assert(intakePj.documentLinks[0].checkAddenda === true, 'checkAddenda stored');
assert(intakePj.invitations[0].notes === null, 'inviteBody is not notes');

const sticky = mergeProcess(emptyProcess(), { notes: '  clerk pad  ' });
assert(sticky.notes === 'clerk pad', 'process.notes sticky persist');
const notesGone = mergeProcess(sticky, { notes: '' });
assert(notesGone.notes === null, 'empty notes clears');

const clipped = mergeProcess(emptyProcess(), {
  invitations: [{ contact: { name: 'Pat' }, inviteBody: 'x'.repeat(50_001) }],
});
assert(clipped.invitations[0].inviteBody?.length === 50_000, 'inviteBody capped');

const now = new Date('2026-09-10T12:00:00Z');
assert(isNewBid('2026-09-08T00:00:00Z', null, now) === true, 'isNew within 7d');
assert(isNewBid('2026-08-01T00:00:00Z', null, now) === false, 'isNew older than 7d');
assert(canEditBid({ role: 'admin' }, 3) === true, 'admin edits any team');
assert(canEditBid({ role: 'super_admin' }, 3) === true, 'super_admin edits any team');
assert(canEditBid({ role: 'captain', bidTeamId: 2 }, null) === true, 'unassigned bid anyone edits');
assert(canEditBid({ role: 'captain', bidTeamId: 2 }, 2) === true, 'same team edits');
assert(canEditBid({ role: 'captain', bidTeamId: 2 }, 3) === false, 'other team cannot edit');
assert(canEditBid({ role: 'assistant_estimator', bidTeamId: null }, 3) === false, 'no team cannot edit assigned');
assert(
  canEditBid({ role: 'captain', id: 9, bidTeamId: null }, 3, 9) === true,
  'named captain edits without My team',
);
assert(
  canEditBid({ role: 'captain', id: 9, bidTeamId: null }, 3, 8) === false,
  'other login is not the named captain',
);
assert(plateForRole('bid_clerk').plateId === 'clerk', 'clerk plate');
assert(plateForRole('admin').plateId === 'admin', 'admin plate');
assert(plateForRole('captain').groups.map((g) => g.id).join() === 'due,upcoming,assigned', 'captain widgets');
assert(APP_ROLE_IDS.every((r) => plateForRole(r).groups.length === 3), 'every role has due/upcoming/assigned');

const today = todayYmd(new Date(2026, 8, 10));
assert(today === '2026-09-10', 'todayYmd local');
assert(dueBucket('2026-09-09', today) === 'overdue', 'overdue');
assert(dueBucket('2026-09-10', today) === 'due', 'due today');
assert(dueBucket('2026-09-12', today) === 'upcoming', 'upcoming');
assert(dueBucket(null, today) === 'none', 'no date');

const sample = [
  { id: '1', processStage: 'intake', outcomeStatus: 'open', dueDate: '2026-09-10', teamId: null },
  { id: '2', processStage: 'assignment', outcomeStatus: 'open', dueDate: '2026-09-12', teamId: null },
  { id: '3', processStage: 'takeoff', outcomeStatus: 'open', dueDate: '2026-09-20', teamId: 2 },
  { id: '4', processStage: 'result', outcomeStatus: 'awarded', dueDate: '2026-09-11', teamId: 2 },
  { id: '5', processStage: 'estimating_setup', outcomeStatus: 'open', dueDate: '2026-09-10', teamId: 2 },
];
const clerk = fillPlateGroups('bid_clerk', sample, { now: new Date(2026, 8, 10) });
assert(clerk.find((g) => g.id === 'assigned')?.rows.map((r) => r.id).join() === '1', 'clerk assigned = intake');
assert(clerk.find((g) => g.id === 'due')?.rows.map((r) => r.id).join() === '1', 'clerk due = intake due today');
assert(plateForRole('admin').groups.find((g) => g.id === 'assigned')?.title === 'All bids', 'admin list title');
const nick = fillPlateGroups('admin', sample, { now: new Date(2026, 8, 10) });
assert(
  nick.find((g) => g.id === 'assigned')?.rows.map((r) => r.id).sort().join() === '1,2,3,4,5',
  'admin assigned = every bid',
);
assert(nick.find((g) => g.id === 'due')?.rows.some((r) => r.id === '1'), 'admin due includes intake');
const cap = fillPlateGroups('captain', sample, { bidTeamId: 2, now: new Date(2026, 8, 10) });
assert(cap.find((g) => g.id === 'assigned')?.rows.map((r) => r.id).sort().join() === '3,5', 'captain team estimating');
const ae = fillPlateGroups('assistant_estimator', sample, { bidTeamId: 2, now: new Date(2026, 8, 10) });
assert(ae.find((g) => g.id === 'due')?.rows.map((r) => r.id).join() === '5', 'AE due this week on team');
const pm = fillPlateGroups('project_manager', sample, { now: new Date(2026, 8, 10) });
assert(pm.find((g) => g.id === 'assigned')?.rows.map((r) => r.id).join() === '4', 'PM assigned = awarded');
assert(plateCalendarDate({ bidDate: '2026-10-02', dueDate: '2026-01-01' }) === '2026-10-02', 'bidDate wins calendar');
const byBid = fillPlateGroups(
  'bid_clerk',
  [{ id: '9', processStage: 'intake', outcomeStatus: 'open', bidDate: '2026-09-10', teamId: null }],
  { now: new Date(2026, 8, 10) },
);
assert(byBid.find((g) => g.id === 'due')?.rows.map((r) => r.id).join() === '9', 'dashboard due uses bidDate');

const excel = bidListExcelRow(
  {
    estimateNumber: 'B-100',
    bidName: 'Weinberg',
    companyName: 'Goel',
    clientCompanyName: 'JHU',
    dueDate: '2026-09-10',
    dueTime: '14:00',
    processStage: 'takeoff',
    outcomeStatus: 'open',
    status: 'draft',
    workType: 'duct',
    bidKind: 'hard',
    ownerProjectNumber: 'OWN-1',
    mechanicalEngineerProjectNumber: 'ME-2',
    isNew: true,
  },
  'Team Wilder',
);
assert(excel.stage === 'Takeoff & Estimate', 'excel stage label');
assert(excel.teamName === 'Team Wilder', 'excel team name');
assert(excel.isNew === 'Yes', 'excel new flag');
assert(BID_LIST_EXCEL_COLUMNS.every((c) => c.key in excel), 'excel columns covered');

const captains = [
  { userId: 12, name: 'Wilder Rodriguez', email: 'wilder@goel.com', teamId: 2 },
  { userId: 13, name: 'Bil', email: 'bil@goel.com', teamId: null },
];
const teams = [
  { id: 2, captain: 'Wilder Rodriguez', bidClerk: 'Hassan Riaz', captainUserId: 12 },
  { id: 3, captain: 'Mike', bidClerk: 'John', captainUserId: null },
];
const blankCrew = emptyProcess().assignment;
const fromCap = bindAssignmentCrew({ ...blankCrew, captainUserId: 12 }, captains, teams);
assert(fromCap.teamId === 2 && fromCap.captain === 'Wilder Rodriguez', 'captainUserId fills team');
const fromName = bindAssignmentCrew({ ...blankCrew, captain: 'wilder rodriguez' }, captains, teams);
assert(fromName.teamId === 2 && fromName.captainUserId === 12, 'captain name fills team');
const fromTeam = bindAssignmentCrew({ ...blankCrew, teamId: 2 }, captains, teams);
assert(
  fromTeam.captainUserId === 12 && fromTeam.captain === 'Wilder Rodriguez' && fromTeam.bidClerk === 'Hassan Riaz',
  'team fills captain + clerk',
);
assert(bindAssignmentCrew({ ...blankCrew, captainUserId: 12, teamId: 3 }, captains, teams).teamId === 2, 'captain wins over teamId');
assert(bindAssignmentCrew({ ...blankCrew, captain: 'Mike' }, captains, teams).teamId == null, 'excel name is not a captain');
assert(bindAssignmentCrew({ ...blankCrew, teamId: 3 }, captains, teams).captainUserId == null, 'team without login captain stays empty');
assert(EXCEL_BID_TEAMS.length === 3 && EXCEL_BID_TEAMS[0].captain === 'Wilder Rodriguez', 'excel roster in system');
const peopleIdx = indexPeopleByName([
  { firstName: 'Mike', lastName: 'Roberts', email: 'mike@goel.com' },
  { firstName: 'John Carlo', lastName: 'Orpilla', email: 'jco@goel.com' },
]);
assert(lookupPersonByName(peopleIdx, 'Mike Robberts')?.email === 'mike@goel.com', 'excel Mike alias');
assert(lookupPersonByName(peopleIdx, 'John Carlo Orpilla')?.email === 'jco@goel.com', 'full crew name');
const roster = excelRosterContacts();
assert(roster.some((p) => p.name === 'Hassan Riaz' && p.role === 'bid_clerk'), 'excel Hassan clerk');
assert(roster.some((p) => p.name === 'John Carlo Orpilla' && p.role === 'assistant_estimator'), 'excel AE');
assert(roster.some((p) => p.name === 'Edle Nobleza' && p.role === 'assistant_estimator'), 'Mike hydronic2 in picker');
assert(
  teamBelongsToCaptain(
    {
      teamName: 'Mike Robberts',
      captain: 'Mike Roberts',
      crewJson: JSON.stringify({
        captain: { appUserId: null, connecteamUserId: 14395212, name: 'Mike Roberts', email: 'mike.roberts@goelservices.com' },
      }),
    },
    {
      userId: 32,
      email: 'mike.roberts@goelservices.com',
      displayName: 'mike.roberts@goelservices.com',
      connecteamUserId: 14395212,
      connecteamName: 'Mike Roberts',
    },
  ),
  'Mike login matches seeded crew',
);
assert(
  !teamBelongsToCaptain(
    { teamName: 'Wilder Rodriguez', captain: 'Wilder Rodriguez', crewJson: null },
    { userId: 32, email: 'mike.roberts@goelservices.com', displayName: 'mike.roberts@goelservices.com', connecteamUserId: 14395212, connecteamName: 'Mike Roberts' },
  ),
  'Mike does not steal Wilder crew',
);
const crewContacts = mergeBiddingContacts(
  [{ appUserId: 9, connecteamUserId: null, name: 'Hassan Riaz', email: 'hassan@goel.com', firstName: 'Hassan', lastName: 'Riaz', role: 'assistant_estimator' }],
  [{ appUserId: null, connecteamUserId: 100, name: 'John Carlo Orpilla', email: null, firstName: 'John Carlo', lastName: 'Orpilla' }],
  roster,
);
assert(crewContacts.some((p) => p.name === 'Hassan Riaz' && p.role === 'assistant_estimator' && p.appUserId === 9), 'AE login wins roster');
assert(crewContacts.some((p) => p.name === 'John Carlo Orpilla' && p.connecteamUserId === 100), 'connecteam AE in picker');
assert(crewContacts.some((p) => p.name === 'Mark Tan'), 'excel clerk still listed');
assert(resolveEstimatesTeamId({ role: 'captain', userTeamId: 2 }) === 2, 'captain estimates own team');
assert(resolveEstimatesTeamId({ role: 'admin', userTeamId: 2 }) === null, 'admin estimates unfiltered');
assert(resolveEstimatesTeamId({ queryTeamId: 'all', role: 'captain', userTeamId: 2 }) === null, 'teamId=all escape');
assert(resolveEstimatesTeamId({ queryTeamId: 3, role: 'admin' }) === 3, 'explicit team filter');
assert(resolveEstimatesTeamId({ role: 'captain', userTeamId: null }) === null, 'captain with no team sees all');
assert(emptyProcess().assignment.captainUserId === null, 'empty captainUserId');

assert(Array.isArray(meta.dashboardPlates) && meta.dashboardPlates.length === APP_ROLE_IDS.length, 'process-meta plates');
assert(meta.dashboardPlates.some((p: { plateId: string }) => p.plateId === 'clerk'), 'meta clerk plate');
assert(!meta.notNow.includes('role dashboard / notifications'), 'dashboard no longer notNow');

console.log('check-bid-process: ok');
