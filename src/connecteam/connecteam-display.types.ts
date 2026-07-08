/** Stable display shapes returned on workforce list/detail APIs. */

export type ConnecteamRefJobSummary = {
  id: number;
  jobNumber: string | null;
  name: string;
  jobAddress: string | null;
  city: string | null;
  isActive: boolean;
};

export type ConnecteamUserSummary = {
  userId: number;
  displayName: string;
  initials: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  employeeId: string | null;
  phoneNumber: string | null;
  userType: string | null;
  profilePictureUrl: string | null;
};

export type ConnecteamJobSummary = {
  jobId: string;
  jobLabel: string;
  title: string | null;
  code: string | null;
  normalizedJobNumber: string | null;
  companyLabel: string | null;
  gpsAddress: string | null;
  refJobId: number | null;
  refJob: ConnecteamRefJobSummary | null;
};

export type ConnecteamTimingDisplay = {
  startAt: string | null;
  endAt: string | null;
  isOpen: boolean;
  durationMinutes: number | null;
  durationHours: number | null;
};
