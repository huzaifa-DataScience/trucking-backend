/** Late Submission Audit: ticket entered >24h after ticket date */
export class LateSubmissionRowDto {
  ticketNumber: string;
  ticketDate: string;
  systemDate: string;
  lagTime: string; // e.g. "+4 Days"
  signedBy: string | null;
  jobName: string;
  haulerCompanyName: string;
}

/** Efficiency Outlier: truck vs fleet average on same route */
export class EfficiencyOutlierRowDto {
  date: string;
  jobName: string;
  routeName: string; // destination/site for context
  truckNumber: string;
  fleetAvgLoads: number;
  thisTruckLoads: number;
  firstTicketTime: string; // e.g. "07:00"
  lastTicketTime: string;
  impliedHours: number;
  loadsPerHour: number;
}
