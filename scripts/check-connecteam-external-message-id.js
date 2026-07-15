// ponytail: fails if composite Connecteam message ids (~73) no longer fit ExternalMessageId.
// Ceiling: `{conversationUuid}-{messageUuid}` = 73; column/entity must stay >= 128.
const sample =
  'bbc30fd6-8c81-499a-a221-475033e21473-2a85d5fd-72ed-4372-89d1-c61a3aef0ef5';
const MAX = 128;
if (sample.length <= 64) throw new Error('expected composite id longer than old nvarchar(64)');
if (sample.length > MAX) throw new Error(`id ${sample.length} exceeds ExternalMessageId max ${MAX}`);
console.log('ok', { sampleLen: sample.length, max: MAX });
