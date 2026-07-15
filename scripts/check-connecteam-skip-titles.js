// ponytail: fails if Time & Attendance auto clock-out no longer skipped by default.
const DEFAULT = 'Time & Attendance';
const set = new Set(DEFAULT.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
if (!set.has('time & attendance')) throw new Error('default skip titles must include Time & Attendance');
const body = '**❗Your shift ended automatically** after exceeding your 8.0-hour limit.'.toLowerCase();
if (!body.includes('shift ended automatically')) throw new Error('content skip pattern broken');
console.log('ok: Time & Attendance skip defaults');
