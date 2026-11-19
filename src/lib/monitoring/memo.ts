// Памятка для инженера, который настраивает отправку с контроллера.
// Один источник текста: показывается в админке и копируется кнопкой.

export const TOKEN_PLACEHOLDER = "<ТОКЕН — выдаётся при создании контроллера>";

export function buildEngineerMemo(input: {
  name: string;
  url: string;
  externalId: string;
  token?: string | null;
}): string {
  const token = input.token ?? TOKEN_PLACEHOLDER;
  const id = input.externalId;

  return `ДОСТУП К ВЕБХУКУ CRM «Хорошие Бассейны»
Объект: ${input.name}

Адрес:          POST ${input.url}
Заголовки:      Content-Type: application/json
                Authorization: Bearer ${token}
controller_id:  ${id}

━━ 1. АВАРИЯ — сразу при срабатывании и при снятии ━━
Формат — как в вашем pool-webhook-alarms-test.json, менять ничего не нужно:

{
  "type": "alarm",
  "event": "raised",
  "message_id": "уникален для отправки, при повторах не меняется",
  "event_id": "один и тот же у raised и cleared",
  "controller_id": "${id}",
  "timestamp": "2026-11-17T17:40:12+03:00",
  "station": { "model": "DOMINATOR", "station_id": "dominator-pool-control-system_31", "zone": "main", "zone_title": "Основной бассейн" },
  "alarm": { "code": "ph_sensor_alarm", "title": "Авария датчика pH", "severity": "critical" }
}

При снятии — то же с "event": "cleared", тем же event_id, плюс "raised_at" и "duration_s".
Для heat_blocked добавьте в alarm поле "reason" — текст причины (например «нет потока», «экорежим»).

━━ 2. СВОДКА — раз в час и сразу после восстановления связи ━━

{
  "type": "summary",
  "message_id": "sum-1794930000",
  "controller_id": "${id}",
  "timestamp": "2026-11-17T19:00:00+03:00",
  "zones": [
    {
      "zone": "main",
      "zone_title": "Основной бассейн",
      "station": { "model": "DOMINATOR", "station_id": "dominator-pool-control-system_31" },
      "online": true,
      "values": {
        "ph": 7.21,
        "chlorine": 0.62,
        "rx": 715,
        "water_temp": 28.4,
        "flow": true,
        "filtration": true,
        "heating": false,
        "eco_mode": false
      }
    }
  ],
  "active_alarms": [
    { "event_id": "evt-dom-ph_sensor_alarm-1794926412", "code": "ph_sensor_alarm", "title": "Авария датчика pH", "severity": "critical", "zone": "main", "zone_title": "Основной бассейн", "raised_at": "2026-11-17T17:40:12+03:00" }
  ]
}

• values — любые параметры: ключ → число или true/false. Набор ключей на ваше усмотрение.
  Эти ключи CRM подпишет по-русски сама: ph, chlorine, rx, water_temp, air_temp, flow,
  filtration, heating, eco_mode, а также уставки вида ph_setpoint. Остальные покажет как есть.
  Можно прислать параметр с описанием: "ph": { "value": 7.21, "title": "pH", "unit": "", "min": 7.0, "max": 7.6 }
• active_alarms — ВСЕ аварии, активные на момент отправки (пустой массив, если их нет).
  По этому списку CRM сверяется: чего в списке нет — считает снятым, чего не знала — заводит.
  Поэтому потерянное сообщение об аварии не страшно.

━━ 3. ПИНГ — по желанию, если нужна проверка связи чаще сводки ━━

{ "type": "ping", "message_id": "ping-1794930600", "controller_id": "${id}", "timestamp": "2026-11-17T19:10:00+03:00" }

━━ ОТВЕТЫ СЕРВЕРА ━━
200 { "ok": true }                   принято
200 { "ok": true, "duplicate": true } повтор с тем же message_id, уже обработано
400 { "ok": false, "error": "…" }    ошибка в формате, текст в error — повтор не поможет
401 / 403                            неверный токен или чужой controller_id
5xx или нет ответа                   повторить с тем же message_id

Если сводок и пингов нет дольше 90 минут — CRM показывает «Нет связи» и уведомляет сервисников.

━━ ПРОВЕРКА ━━
curl -X POST "${input.url}" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"ping","message_id":"test-ping-1","controller_id":"${id}"}'

Ожидаемый ответ: {"ok":true,"received":"ping",…}
`;
}
