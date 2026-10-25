export type HistoryFilters = {
  blockId?: string;
  regionId?: string;
  status?: "ON" | "OFF";
  mode?: "AUTO" | "MANUAL";
  dateFrom?: string;
  dateTo?: string;
  cursor?: string;
  limit?: number;
  sort?: { key?: string; dir?: string };
};
