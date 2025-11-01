export interface SafetyReport {
  flags: {
    selfReference: boolean;
    abstractionOverload: boolean;
    loopSuspect: boolean;
  };
  action: "allow" | "rewrite-soft" | "block";
  note: string;
  suggestMode?: string;
}
