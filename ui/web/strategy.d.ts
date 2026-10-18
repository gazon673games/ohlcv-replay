type WorkbenchTarget = -1 | 0 | 1;

interface StrategyBar {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  [key: string]: string | number | boolean | null;
}

interface StrategySeries {
  readonly columns: Record<string, unknown[]>;
  readonly length: number;
  rows(): StrategyBar[];
  value(column: string, offset?: number): unknown;
  values(column: string, options?: { from?: string; to?: string; bars?: number }): unknown[];
}

interface StrategyContext {
  bar: StrategyBar;
  timeframe: string;
  barMinutes: number;
  decisionTime: string | null;
  currentTs: string;
  date: string;
  time: string;
  weekday: number;
  position: number;
  previousPosition: number;
  activeContract: string | null;
  orderStatuses: Record<string, unknown>[];
  history: StrategySeries;
  session: StrategySeries;
  indicators: {
    sma(column: string, window: number, source?: "history" | "session"): number | null;
    ema(column: string, window: number, source?: "history" | "session"): number | null;
  };
}

interface StrategyDecision {
  target: WorkbenchTarget;
  /** Absolute contract count. Required for non-flat Workbench decisions. */
  contracts?: number;
  /** Skip a same-direction futures addition when its full margin and costs exceed funds. */
  skip_unaffordable_add?: boolean;
  reason?: string;
  debug?: Record<string, unknown>;
  features?: Record<string, unknown>;
  order?: StrategyOrder;
  plots?: { type: "line" | "marker" | "panel"; name: string; value: unknown }[];
}

interface WorkbenchStrategyMetadata {
  name: string;
  version?: string;
  timeframe: `${number}m`;
  schedule: "every-bar" | "times";
  decision_times?: string[];
  /** String parameter that sets a single decision time; its default matches decision_times. */
  decision_time_param?: string;
  decision_tolerance_minutes?: number;
  missing_decision_policy: "carry" | "close" | "skip";
  warmup_bars?: number;
  /** Maximum visible history sent to each strategy decision. */
  history_bars?: number;
  /** Market-data fields exposed to history and session series. */
  data_columns?: string[];
  params?: Record<string, unknown>[];
}

declare var STRATEGY_METADATA: WorkbenchStrategyMetadata;

interface StrategyOrder {
  type?: "market" | "limit" | "stop" | "stop_limit";
  order_id?: string;
  limit_price?: number;
  stop_price?: number;
  time_in_force?: "day" | "gtc" | "ioc" | "fok";
  cancel_order_id?: string;
  replace_order_id?: string;
  take_profit_price?: number;
  stop_loss_price?: number;
}

declare const math: {
  avg(values: unknown[]): number | null;
  ema(values: unknown[], window: number): number | null;
  max(values: unknown[]): number;
  min(values: unknown[]): number;
  sma(values: unknown[], window: number): number | null;
  sum(values: unknown[]): number;
};

declare const plot: {
  line(name: string, value: unknown): void;
  marker(name: string, value: unknown): void;
  panel(name: string, value: unknown): void;
};

declare function onDecision(
  ctx: StrategyContext,
  params: Record<string, string | number | boolean | null>,
): StrategyDecision | WorkbenchTarget;
