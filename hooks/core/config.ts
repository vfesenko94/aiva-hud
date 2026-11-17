import type { PluginOptions } from "claude-code";

import type { Ttl } from "../../types";

export type Display<F extends string> = { format: F; hover: F | null };

export type ModelFormat = "full" | "family";

export type ContextFormat = "full" | "used" | "percent";

export type LimitFormat =
  "labeled" | "percent" | "labeledFraction" | "fraction" | "countdown";

export type CacheFormat = "clock" | "units" | "minutes" | "labeled";

export type CacheDisplay = Display<CacheFormat> & { until: boolean };

export type HintKey =
  | "cycle"
  | "prStatus"
  | "subagents"
  | "interrupt"
  | "tasks"
  | "teamLead"
  | "shortcuts"
  | "agents"
  | "copy"
  | "voice"
  | "manage"
  | "artifacts";

export const keyHints = {
  grid: "↑↓←→",
  vertical: "↑↓",
  horizontal: "←→",
  activate: "space/enter",
  close: "esc",
  focus: "Alt+S",
};

export const cacheGlyph = "◷";

export const timeUnits = { second: 1000, minute: 60_000, hour: 3_600_000 };

export const baseConfig = {
  cache: {
    ttl: null as Ttl | null,
  },
  thresholds: {
    percent: { warning: 65, error: 85 },
  },
  timing: {
    stripTickMs: timeUnits.second,
  },
};

export type HudConfig = typeof baseConfig;

export const isTtl = (value: unknown): value is Ttl =>
  value === "5m" || value === "1h";

export const resolveConfig = (options: PluginOptions): HudConfig => ({
  ...baseConfig,
  cache: {
    ...baseConfig.cache,
    ttl: isTtl(options.cacheTtl) ? options.cacheTtl : null,
  },
});
