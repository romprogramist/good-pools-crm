// Чистые функции представления: статус объекта, разбор сводки, подсказки по авариям.
// Без обращений к БД — используются и на сервере, и в клиентских компонентах.

/** Сколько тишины считаем потерей связи. Сводка идёт раз в час → полтора часа с запасом. */
export const OFFLINE_AFTER_MS = 90 * 60 * 1000;

export type MonitorStatus = "ok" | "warning" | "critical" | "offline" | "waiting" | "disabled";

export const STATUS_ORDER: Record<MonitorStatus, number> = {
  critical: 0,
  offline: 1,
  warning: 2,
  ok: 3,
  waiting: 4,
  disabled: 5,
};

export const STATUS_LABEL: Record<MonitorStatus, string> = {
  ok: "Всё в норме",
  warning: "Требует внимания",
  critical: "Авария",
  offline: "Нет связи",
  waiting: "Ждём данные",
  disabled: "Отключён",
};

export function controllerStatus(
  c: { active: boolean; lastSeenAt: Date | null; expectHeartbeat: boolean },
  openAlarms: { severity: string }[],
  now: Date = new Date(),
): MonitorStatus {
  if (!c.active) return "disabled";
  if (!c.lastSeenAt) return "waiting";
  if (c.expectHeartbeat && now.getTime() - c.lastSeenAt.getTime() > OFFLINE_AFTER_MS) return "offline";
  if (openAlarms.some((a) => a.severity === "critical")) return "critical";
  if (openAlarms.length > 0) return "warning";
  return "ok";
}

// ─── Аварии: что это значит и что делать ─────────────────────────────────

const ALARM_HINTS: Record<string, string> = {
  ph_canister_low_level_alarm: "Заканчивается реагент pH. Привезти и заменить канистру, пока дозирование не остановилось.",
  chlorine_canister_low_level_alarm: "Заканчивается хлор. Привезти и заменить канистру, пока дозирование не остановилось.",
  rx_canister_low_level_alarm: "Заканчивается реагент Rx. Привезти и заменить канистру.",
  oxygen_canister_low_level_alarm: "Заканчивается активный кислород. Привезти и заменить канистру.",
  flocculant_canister_low_level_alarm: "Заканчивается флокулянт. Привезти и заменить канистру.",
  algaecide_canister_low_level_alarm: "Заканчивается альгицид. Привезти и заменить канистру.",
  ph_sensor_alarm: "Датчик pH не даёт достоверных показаний. Проверить и откалибровать датчик — дозирование pH может быть остановлено.",
  chlorine_sensor_alarm: "Датчик хлора не даёт достоверных показаний. Проверить и откалибровать датчик — дозирование хлора может быть остановлено.",
  rx_sensor_alarm: "Датчик Rx не даёт достоверных показаний. Проверить и откалибровать датчик.",
  max_water_level_alarm: "Уровень воды выше максимума. Проверить клапан долива и перелив.",
  min_water_level_alarm: "Уровень воды ниже минимума. Проверить долив и нет ли утечки — насосы могут работать всухую.",
  external_alarm: "Сработал внешний аварийный сигнал на станции. Нужен выезд и осмотр оборудования.",
  system_timer_alarm: "Сбой системного таймера станции. Проверить дату и время на станции.",
  station_offline: "Контроллер не видит станцию дозирования. Проверить питание станции и кабель связи.",
  heat_blocked: "Нагрев отключён защитой. Он включится сам, когда причина исчезнет.",
};

export function alarmHint(code: string): string | null {
  return ALARM_HINTS[code] ?? null;
}

// ─── Показания ───────────────────────────────────────────────────────────

type ParamDef = {
  label: string;
  unit?: string;
  /** Ориентир нормы — только подсветка, аварии определяет сам контроллер. */
  min?: number;
  max?: number;
  digits?: number;
  bool?: [on: string, off: string];
  order: number;
};

const PARAMS: { match: RegExp; def: ParamDef }[] = [
  { match: /^ph(_value)?$/, def: { label: "pH", min: 7.0, max: 7.6, digits: 2, order: 1 } },
  {
    match: /^(cl|chlorine|free_chlorine)(_value)?(_mg_?l)?$/,
    def: { label: "Хлор", unit: "мг/л", min: 0.3, max: 1.5, digits: 2, order: 2 },
  },
  { match: /^(rx|redox|orp)(_value)?(_mv)?$/, def: { label: "Redox (Rx)", unit: "мВ", min: 650, max: 800, digits: 0, order: 3 } },
  {
    match: /^(water_)?temp(erature)?(_water)?(_c)?$/,
    def: { label: "Температура воды", unit: "°C", digits: 1, order: 4 },
  },
  { match: /^air_temp(erature)?(_c)?$/, def: { label: "Температура воздуха", unit: "°C", digits: 1, order: 5 } },
  { match: /^(water_)?level(_cm|_mm|_percent)?$/, def: { label: "Уровень воды", digits: 0, order: 6 } },
  { match: /^(flow|flow_ok|flow_control)$/, def: { label: "Поток воды", bool: ["Есть", "Нет"], order: 10 } },
  { match: /^(filtration|filter|filter_pump|pump)(_on|_enabled)?$/, def: { label: "Фильтрация", bool: ["Работает", "Выключена"], order: 11 } },
  { match: /^(heating|heat|heater)(_on|_enabled)?$/, def: { label: "Нагрев", bool: ["Работает", "Выключен"], order: 12 } },
  { match: /^eco(_mode)?(_on|_enabled)?$/, def: { label: "Экорежим", bool: ["Включён", "Выключен"], order: 13 } },
  { match: /^(heat_block|heat_blocked|heating_blocked)$/, def: { label: "Защита нагрева", bool: ["Нагрев запрещён", "Не сработала"], order: 14 } },
];

const SETPOINT_RE = /^(.+?)_(setpoint|target|set)$/;

export type Metric = {
  key: string;
  label: string;
  unit: string | null;
  value: number | boolean | string | null;
  /** Готовая строка для показа: «7,21», «Работает», «—». */
  display: string;
  min: number | null;
  max: number | null;
  digits: number;
  outOfRange: boolean;
  /** Уставка — задаётся человеком, на графиках и в кратком списке не нужна. */
  isSetpoint: boolean;
  order: number;
};

export type ZoneView = {
  zone: string;
  title: string;
  model: string | null;
  online: boolean | null;
  metrics: Metric[];
};

type Rec = Record<string, unknown>;

function isRec(v: unknown): v is Rec {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function findDef(key: string): ParamDef | null {
  const k = key.toLowerCase();
  for (const p of PARAMS) if (p.match.test(k)) return p.def;
  return null;
}

function humanize(key: string): string {
  const s = key.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v.replace(",", ".")))) {
    return Number(v.replace(",", "."));
  }
  return null;
}

export function formatNumber(v: number, digits: number): string {
  return v.toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function buildMetric(key: string, rawValue: unknown): Metric | null {
  // Значение может быть простым (7.21) или самоописанным: {value, unit, title, min, max}.
  let raw = rawValue;
  let own: Rec = {};
  if (isRec(rawValue)) {
    if (!("value" in rawValue)) return null;
    own = rawValue;
    raw = rawValue.value;
  }
  if (Array.isArray(raw)) return null;

  let def = findDef(key);
  let label = def?.label ?? humanize(key);
  const sp = SETPOINT_RE.exec(key.toLowerCase());
  if (!def && sp) {
    const base = findDef(sp[1]);
    if (base) {
      def = { ...base, min: undefined, max: undefined, order: base.order + 0.5 };
      label = `${base.label} — уставка`;
    }
  }
  if (typeof own.title === "string" && own.title.trim()) label = own.title.trim();
  else if (typeof own.label === "string" && own.label.trim()) label = own.label.trim();

  const unit = (typeof own.unit === "string" && own.unit.trim()) || def?.unit || null;
  const min = num(own.min) ?? def?.min ?? null;
  const max = num(own.max) ?? def?.max ?? null;
  const order = def?.order ?? 50;

  const base = { key, label, unit, min, max, order, isSetpoint: sp !== null };

  if (raw === null || raw === undefined) {
    return { ...base, value: null, display: "—", digits: 0, outOfRange: false };
  }

  if (typeof raw === "boolean" || (def?.bool && (raw === 0 || raw === 1))) {
    const b = raw === true || raw === 1;
    const words = def?.bool ?? ["Да", "Нет"];
    return { ...base, unit: null, value: b, display: b ? words[0] : words[1], digits: 0, outOfRange: false, min: null, max: null };
  }

  const n = num(raw);
  if (n !== null) {
    const digits = def?.digits ?? (Number.isInteger(n) ? 0 : Math.abs(n) < 10 ? 2 : 1);
    const outOfRange = (min !== null && n < min) || (max !== null && n > max);
    return { ...base, value: n, display: formatNumber(n, digits), digits, outOfRange };
  }

  return { ...base, value: String(raw), display: String(raw).slice(0, 60), digits: 0, outOfRange: false };
}

const ZONE_META_KEYS = new Set([
  "zone",
  "zone_title",
  "title",
  "name",
  "station",
  "station_id",
  "model",
  "online",
  "values",
  "sensors",
  "data",
  "alarms",
  "active_alarms",
]);

function zoneFromRec(z: Rec, fallbackKey: string): ZoneView {
  const station = isRec(z.station) ? z.station : {};
  const zone = (typeof z.zone === "string" && z.zone) || fallbackKey;
  const title =
    (typeof z.zone_title === "string" && z.zone_title) ||
    (typeof z.title === "string" && z.title) ||
    (typeof station.zone_title === "string" && station.zone_title) ||
    humanize(zone);
  const model = (typeof station.model === "string" && station.model) || (typeof z.model === "string" && z.model) || null;
  const online = typeof z.online === "boolean" ? z.online : z.online === 1 ? true : z.online === 0 ? false : null;

  const source: Rec = isRec(z.values)
    ? z.values
    : isRec(z.sensors)
      ? z.sensors
      : isRec(z.data)
        ? z.data
        : Object.fromEntries(Object.entries(z).filter(([k]) => !ZONE_META_KEYS.has(k)));

  const metrics: Metric[] = [];
  for (const [k, v] of Object.entries(source)) {
    const m = buildMetric(k, v);
    if (m) metrics.push(m);
  }
  metrics.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "ru"));
  return { zone, title, model, online, metrics };
}

/** Разбирает сводку в список зон с показаниями. Терпим к вариантам формата. */
export function parseSummary(payload: unknown): ZoneView[] {
  if (!isRec(payload)) return [];
  const zones = payload.zones;
  if (Array.isArray(zones)) {
    return zones.filter(isRec).map((z, i) => zoneFromRec(z, `zone${i + 1}`));
  }
  if (isRec(zones)) {
    return Object.entries(zones)
      .filter((e): e is [string, Rec] => isRec(e[1]))
      .map(([k, z]) => zoneFromRec(z, k));
  }
  if (isRec(payload.values)) {
    return [zoneFromRec({ zone: "main", zone_title: "Объект", values: payload.values }, "main")];
  }
  return [];
}

export type SeriesPoint = { t: number; v: number };

export type Series = {
  id: string; // zone + key
  zone: string;
  zoneTitle: string;
  key: string;
  label: string;
  unit: string | null;
  min: number | null;
  max: number | null;
  digits: number;
  order: number;
  points: SeriesPoint[];
};

/** Собирает временные ряды числовых показаний по всем сводкам периода. */
export function buildSeries(readings: { at: Date; payload: unknown }[]): Series[] {
  const map = new Map<string, Series>();
  for (const r of readings) {
    for (const z of parseSummary(r.payload)) {
      for (const m of z.metrics) {
        if (typeof m.value !== "number" || m.isSetpoint) continue;
        const id = `${z.zone}::${m.key}`;
        let s = map.get(id);
        if (!s) {
          s = {
            id,
            zone: z.zone,
            zoneTitle: z.title,
            key: m.key,
            label: m.label,
            unit: m.unit,
            min: m.min,
            max: m.max,
            digits: m.digits,
            order: m.order,
            points: [],
          };
          map.set(id, s);
        }
        s.zoneTitle = z.title;
        s.points.push({ t: r.at.getTime(), v: m.value });
      }
    }
  }
  return [...map.values()].filter((s) => s.points.length >= 2);
}
