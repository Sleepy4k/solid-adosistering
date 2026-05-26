export type HistoryFilters = {
  blockId?: string;
  regionId?: string;
  status?: "ON" | "OFF";
  mode?: "AUTO" | "MANUAL";
  dateFrom?: string;
  dateTo?: string;
};
