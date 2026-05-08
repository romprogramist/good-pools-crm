# Этап 7 — Календарь и онлайн-запись. Дизайн

> Дата: 2026-05-08
> Связанные документы: [`spec.md`](../../../spec.md), [`plan.md`](../../../plan.md) (этап 7)

---

## 1. Цель

Дать сервисникам инструмент планирования визитов на бассейны клиентов (одиночных и серийных), а клиентам — возможность отправить заявку на сервис без выбора конкретного слота. Все визиты видны в общем календаре всех сервисников. На этом этапе — **только планирование**: заполнение чек-листа, фото, химия и PDF-отчёт — этап 8; реальные пуши — этап 12; реальный платёжный провайдер — этап 13.

## 2. Принятые решения

| # | Решение | Обоснование |
|---|---|---|
| 1 | При приёмке заявки сервисник выбирает **конкретные дату+время+длительность** | Календарю нужен слот; «диапазон» из спеки = желание клиента, а не время визита |
| 2 | Слот = `scheduledAt` (UTC) + `durationMinutes` (дефолт 60) | Стандарт для планировщика; разная высота блоков в timegrid |
| 3 | Серия повторов: визиты генерируются сразу N штук, правятся поодиночке | Простая модель; редко нужны «правка всех» — отложили |
| 4 | Конфликты по времени — warning, а не блок | Бывают совместные визиты на одном объекте, срочные выезды |
| 5 | Блок по долгу при создании заявки — stub в этапе 7, полная реализация в этапе 13 | Чистая изоляция этапов; функция `hasUnpaidDebt` всегда `false` |
| 6 | Календарь — **FullCalendar** (MIT-плагины daygrid/timegrid/list/interaction) | Зрелый, mobile-friendly, русская локаль из коробки, без GPL/коммерции |
| 7 | Все даты в БД — UTC, рендеринг — `Europe/Moscow` (Сочи UTC+3, без DST) | Единая база, корректный рендер на любом сервере |
| 8 | Push в этапе 7 — **stub** (запись в `ActivityLog` + `console.log`) | Реальный Web Push в этапе 12; точки вызова не меняются |
| 9 | Удаление визитов запрещено, только `status = canceled` | История нужна для журнала, реестров и связи с заявками |
| 10 | Цвет события = `hash(serviceUserId) % palette[8]` | Стабильный цвет на сервисника без таблицы цветов в БД |

## 3. Схема БД

Миграция: `20260508_calendar_init`. Все три модели и четыре enum'а добавляются одной миграцией.

```prisma
enum VisitStatus {
  planned
  in_progress
  completed
  canceled
}

enum VisitKind {
  manual
  online_request
  series
}

enum OnlineRequestStatus {
  pending
  accepted
  declined
}

model VisitSeries {
  id              String   @id @default(cuid())
  poolId          String
  serviceUserId   String
  startAt         DateTime
  durationMinutes Int      @default(60)
  recurrence      String   // "weekly" | "biweekly" | "monthly"
  occurrences     Int
  notes           String?
  createdAt       DateTime @default(now())

  pool        Pool    @relation(fields: [poolId], references: [id], onDelete: Cascade)
  serviceUser User    @relation("VisitSeriesServicer", fields: [serviceUserId], references: [id])
  visits      Visit[]

  @@index([poolId])
}

model Visit {
  id              String      @id @default(cuid())
  poolId          String
  serviceUserId   String
  scheduledAt     DateTime
  durationMinutes Int         @default(60)
  status          VisitStatus @default(planned)
  kind            VisitKind   @default(manual)
  seriesId        String?
  notes           String?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  pool          Pool           @relation(fields: [poolId], references: [id], onDelete: Cascade)
  serviceUser   User           @relation("VisitServicer", fields: [serviceUserId], references: [id])
  series        VisitSeries?   @relation(fields: [seriesId], references: [id], onDelete: SetNull)
  onlineRequest OnlineRequest?

  @@index([poolId])
  @@index([serviceUserId])
  @@index([scheduledAt])
  @@index([seriesId])
}

model OnlineRequest {
  id            String              @id @default(cuid())
  customerId    String
  poolId        String
  desiredFrom   DateTime
  desiredTo     DateTime
  message       String?
  status        OnlineRequestStatus @default(pending)
  acceptedById  String?
  visitId       String?             @unique
  declineReason String?
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt

  customer   Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  pool       Pool     @relation(fields: [poolId], references: [id], onDelete: Cascade)
  acceptedBy User?    @relation("OnlineRequestAcceptedBy", fields: [acceptedById], references: [id])
  visit      Visit?   @relation(fields: [visitId], references: [id], onDelete: SetNull)

  @@index([customerId])
  @@index([poolId])
  @@index([status])
}
```

**Изменения в существующих моделях:**
- `User` получает обратные связи `visitsAsServicer Visit[] @relation("VisitServicer")`, `visitSeriesAsServicer VisitSeries[] @relation("VisitSeriesServicer")`, `acceptedRequests OnlineRequest[] @relation("OnlineRequestAcceptedBy")`.
- `Customer` — `onlineRequests OnlineRequest[]`.
- `Pool` — `visits Visit[]`, `visitSeries VisitSeries[]`, `onlineRequests OnlineRequest[]`.

**Инварианты (server-side, не БД-уровнем):**
- `OnlineRequest.status === accepted` ⇒ `acceptedById !== null && visitId !== null`.
- `OnlineRequest.status === declined` ⇒ `visitId === null`.
- `Visit.kind === series` ⇔ `seriesId !== null`.
- Длительность визита `durationMinutes ∈ [5, 24*60)`.
- `Visit.scheduledAt >= now() - 7 дней` (разрешено создавать задним числом до недели — забыли отметить визит в момент).
- `desiredTo >= desiredFrom`, оба `>= today` (Europe/Moscow).
- Серия: `recurrence ∈ {weekly, biweekly, monthly}`, `occurrences ∈ [2, 52]`.
- `serviceUserId` ссылается на `User` с `role ∈ {admin, service} && active`.

## 4. Бизнес-логика

Server actions в трёх файлах:

### 4.1 `src/lib/server-actions/visits.ts`

Все экшены этого файла требуют сессии с ролью `admin | service`.

- `createVisit({ poolId, serviceUserId, scheduledAt, durationMinutes, notes })` — валидация, конфликт-чек (без блока), создание `Visit{ kind: manual, status: planned }`, ActivityLog `visit.create`, push-stub сервиснику (`visit_assigned`).
- `updateVisit(id, patch)` — простое обновление полей. `seriesId` неизменяем (нельзя «превратить» одиночный визит в серию или наоборот через эту функцию). ActivityLog `visit.update`.
- `cancelVisit(id, reason?)` — `status = canceled`. ActivityLog `visit.cancel`. Удаление физически — недоступно.
- `checkVisitConflicts({ serviceUserId, scheduledAt, durationMinutes, excludeVisitId? })` → массив `{ id, scheduledAt, customerName, poolName }` пересечений у того же сервисника со статусом `planned/in_progress`.
- `getVisitsInRange(from, to, filter?: { serviceUserId? })` — для календаря; `canceled` скрыты по умолчанию.

### 4.2 `src/lib/server-actions/visit-series.ts`

- `createVisitSeries({ poolId, serviceUserId, startAt, durationMinutes, recurrence, occurrences, notes })` — транзакция: создаёт `VisitSeries`, генерирует `occurrences` визитов с `kind: series`, шаг по `recurrence`. Для `monthly` использует `date-fns.addMonths` (31 янв + 1 мес → 28/29 фев). Возвращает агрегированный warning по конфликтам, UI решает Confirm/Cancel. ActivityLog `visit.series.create` + `visit.create` ×N.
- `cancelSeries(seriesId, includePast = false)` — массовая отмена `planned` визитов серии (по умолчанию только будущие). ActivityLog `visit.series.cancel`.

### 4.3 `src/lib/server-actions/online-requests.ts`

- `createOnlineRequest({ poolId, desiredFrom, desiredTo, message })` — права: только client, на свой бассейн. Чек `hasUnpaidDebt(customerId)` — если `true`, валидационная ошибка. Создаёт `OnlineRequest{ status: pending }`. ActivityLog `online_request.create`. Push-stub всем `admin + service`.
- `acceptOnlineRequest({ requestId, serviceUserId, scheduledAt, durationMinutes, notes })` — права: `admin | service`. Транзакция: создаёт `Visit{ kind: online_request, status: planned }` напрямую (минуя `createVisit` — нужен явный `kind`) + обновляет `OnlineRequest{ status: accepted, acceptedById, visitId }` под условием `status === pending` (защита от гонки, см. секцию 10). ActivityLog `online_request.accept`, `visit.create`. Push-stub клиенту.
- `declineOnlineRequest({ requestId, reason })` — права: только `admin`. `OnlineRequest{ status: declined, acceptedById }`. ActivityLog `online_request.decline`. Push-stub клиенту с причиной.

### 4.4 Вспомогательные модули

- `src/lib/payments/debt.ts` — экспорт `async function hasUnpaidDebt(customerId: string): Promise<boolean>`. В этапе 7 — `return false`. Этап 13 переписывает реализацию.
- `src/lib/push/stub.ts` — экспорт `async function enqueuePush(kind, recipients, payload)`. Пишет в `ActivityLog` (action `push.queued.<kind>`, entityType `User`, entityId — userId получателя, diff — payload) и `console.log`. Этап 12 заменяет реализацию.
- `src/lib/calendar/timezone.ts` — `formatMoscow(date, format)` через `Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', ... })`. Используется и сервером, и клиентом.

### 4.5 ActivityLog actions

- `visit.create`, `visit.update`, `visit.cancel`
- `visit.series.create`, `visit.series.cancel`
- `online_request.create`, `online_request.accept`, `online_request.decline`
- `push.queued.<kind>` — от push-stub'а

## 5. UI

### 5.1 `/service/calendar`

Server component фетчит сессию, видимый диапазон визитов, список сервисников. Клиентская обёртка `<CalendarView />` импортируется через `next/dynamic` с `ssr: false` (FullCalendar не SSR-friendly).

**Layout:**
```
┌────────────────────────────────────────────────────────┐
│  Календарь                                  [+ Визит]  │
│  ◀  Май 2026  ▶                                        │
│  [Месяц] [Неделя] [День] [Список]                      │
│  Сервисник: ▾ все                                      │
├────────────────────────────────────────────────────────┤
│        FullCalendar grid                               │
│        События раскрашены по сервиснику                │
│        Клик по событию → /service/visits/<id>         │
│        Клик по пустому слоту → форма с предзаполн.    │
└────────────────────────────────────────────────────────┘
```

**Решения:**
- Плагины: `daygrid`, `timegrid`, `list`, `interaction`. Локаль `ru`. Первый день недели — понедельник. `timeZone: 'Europe/Moscow'`.
- На мобильных дефолт — `list` (FullCalendar grid тяжёл на узких экранах).
- Drag-resize выключен в этапе 7 (требует server actions на каждое движение).
- View/date/servicer — в URL: `/service/calendar?view=week&date=2026-05-08&servicer=all`.

### 5.2 Форма `<VisitForm />`

Используется в трёх местах: создание из календаря, редактирование визита, приёмка online-заявки. Открывается модалкой/листом снизу.

**Поля:**
- Клиент (autocomplete по `Customer.fullName`).
- Бассейн (зависит от клиента).
- Сервисник (dropdown по `User.role ∈ {admin, service} && active`, по умолчанию текущий).
- Дата+время начала.
- Длительность в минутах (дефолт 60).
- Заметки.
- Чекбокс «Серия повторов» — раскрывает `recurrence` (weekly/biweekly/monthly) и `occurrences` (2–52). При установленном чекбоксе submit идёт в `createVisitSeries`.

**Конфликт-warning:** перед submit вызов `checkVisitConflicts`. Если есть пересечения — баннер «У сервисника {имя} уже визит {время} — {клиент}/{бассейн}» и кнопка «Всё равно создать». Без конфликтов — submit сразу.

При приёмке online-заявки форма открывается с предзаполнением: `poolId` из заявки, `customerId` (read-only), `scheduledAt = desiredFrom 10:00`, `durationMinutes = 60`. Чекбокс серии скрыт. При **редактировании** существующего визита чекбокс серии тоже не показывается — серийность визита не меняется через `<VisitForm />`.

### 5.3 `/client/request-visit`

Минималистичная форма заявки.

- Если `Customer.pools.length === 0` → сообщение «У вас пока нет ни одного бассейна, обратитесь к администратору».
- Если `hasUnpaidDebt` (в этапе 7 stub всегда `false`) → блок-сообщение, форма не показывается.
- Поля: бассейн (если ≥2 — dropdown, иначе скрыто), `desiredFrom`/`desiredTo` (date input, не datetime), сообщение (textarea, опц.).
- После submit → редирект на `/client/requests`.

### 5.4 `/client/requests`

Список последних 20 заявок клиента: бассейн, желаемый период, статус, дата создания.
- `accepted` → ссылка на конкретный визит (`/client/visits/<id>` — заглушка под этап 8).
- `declined` → причина.

### 5.5 `/service/online-requests`

- Табы: «Новые» (default, `status=pending`), «Принятые», «Отклонённые».
- Карточка заявки: клиент, бассейн (адрес-превью), желаемый период, сообщение, дата создания.
- Кнопки «Принять» (для `admin | service`) и «Отклонить» (только `admin`).
- «Принять» открывает `<VisitForm />` в режиме приёмки.
- Бэйдж количества `pending` показывается в навигации.

### 5.6 Главная сервисника (`src/app/service/page.tsx`)

- Убираем заглушку «Календарь, визиты и заявки появятся в следующих этапах».
- Добавляем 2 карточки: «Календарь» (→ `/service/calendar`) и «Онлайн-заявки» (→ `/service/online-requests`, с бэйджем количества `pending`).
- Под `UpcomingEquipmentWidget` — виджет «Ближайшие визиты» (3 ближайших со статусом `planned` за следующие 7 дней).

### 5.7 Главная клиента (`src/app/client/page.tsx`)

- Убираем заглушку.
- Добавляем 3 карточки: «Мои бассейны» (→ заглушка под будущие этапы), «Заявка на визит» (→ `/client/request-visit`), «Мои заявки» (→ `/client/requests`).

### 5.8 Защита роутов (`src/proxy.ts`)

- `/service/calendar`, `/service/online-requests`, `/service/visits/*` — `admin | service`.
- `/client/request-visit`, `/client/requests` — только `client`.
- Server actions делают доп. проверку владельца ресурса (клиент пишет/читает только свои заявки).

## 6. Миграции и зависимости

- **Prisma**: одна миграция `20260508_calendar_init`. Существующие модели не трогаем кроме обратных связей.
- **Новые npm-пакеты**:
  - `@fullcalendar/core`, `@fullcalendar/react`, `@fullcalendar/daygrid`, `@fullcalendar/timegrid`, `@fullcalendar/list`, `@fullcalendar/interaction` — все MIT.
  - `date-fns` — добавить, если ещё нет в проекте (нужны `addWeeks`, `addMonths`, `startOfDay`).
- Сидер не нужен — визиты создаются через UI.

## 7. Чек-лист этапа (для plan.md)

```
- [ ] Prisma: VisitStatus, VisitKind, OnlineRequestStatus enum'ы; модели Visit, VisitSeries, OnlineRequest; миграция 20260508_calendar_init
- [ ] lib/server-actions/visits.ts: createVisit / updateVisit / cancelVisit / checkVisitConflicts / getVisitsInRange
- [ ] lib/server-actions/visit-series.ts: createVisitSeries / cancelSeries (date-fns weekly/biweekly/monthly)
- [ ] lib/server-actions/online-requests.ts: createOnlineRequest / acceptOnlineRequest / declineOnlineRequest
- [ ] lib/payments/debt.ts: hasUnpaidDebt(customerId) — stub возвращает false
- [ ] lib/push/stub.ts: enqueuePush — пишет в ActivityLog + console.log
- [ ] lib/calendar/timezone.ts: formatMoscow helper для Europe/Moscow
- [ ] /service/calendar: server fetch + <CalendarView /> через next/dynamic ssr:false (FullCalendar daygrid/timegrid/list/interaction, locale ru, timezone Europe/Moscow)
- [ ] <VisitForm />: переиспользуется для create/edit/accept-online-request, конфликт-warning, опциональная серия
- [ ] /client/request-visit: форма + блок по долгу (через stub) + блок если 0 бассейнов
- [ ] /client/requests: список заявок клиента со статусом
- [ ] /service/online-requests: табы (Новые/Принятые/Отклонённые), приёмка через <VisitForm />, отклонение (только admin)
- [ ] Карточки на главной сервисника (Календарь, Онлайн-заявки с бэйджем) + виджет ближайших визитов
- [ ] Карточки на главной клиента (Заявка, Мои заявки)
- [ ] proxy.ts: защита новых роутов по ролям
- [ ] ActivityLog: visit.create/update/cancel, visit.series.create/cancel, online_request.create/accept/decline, push.queued.*
- [ ] Type-check, lint, next build чистые
```

## 8. Тестирование

В проекте автоматических тестов нет (по существующей практике этапов 1-6). Приёмка — ручной чек-пойнт.

**Сценарии для ручной проверки:**
1. Сервисник создаёт визит на завтра 14:00 на 60 мин → виден в календаре в week и month видах.
2. Сервисник создаёт серию weekly × 4 → 4 события одного цвета на 4 недели вперёд.
3. Сервисник создаёт визит на тот же слот другого сервисника → warning, но создаётся (разные цвета).
4. Сервисник создаёт визит на тот же слот **того же** сервисника → warning, можно подтвердить.
5. Клиент логинится → `/client/request-visit` → отправляет заявку с диапазоном 12-15 мая.
6. Сервисник в `/service/online-requests` видит заявку (с бэйджем на главной) → принимает → выбирает 13 мая 10:00 → визит появляется в календаре, заявка → accepted.
7. Клиент в `/client/requests` видит статус «принято» с ссылкой на визит.
8. `console.log` показывает push-stub'ы; `ActivityLog` содержит записи `push.queued.*`.
9. Месячная серия от 31 января проверяется отдельно: 31 янв → 28 фев → 31 марта → 30 апр.

**Чекпойнт юзера** (для plan.md): «Клиент через ЛК отправляет заявку → сервисник видит её в `/service/online-requests` → принимает → видит созданный визит в календаре → клиент видит в ЛК статус «принято».» (как уже сформулировано в plan.md).

## 9. Что НЕ делаем в этапе 7 (явно)

- Drag-resize визитов в календаре — отложено.
- Заполнение чек-листа, фото, химия, доп. работы — этап 8.
- PDF-отчёт — этап 8.
- Реальный Web Push — этап 12.
- Реальный платёжный провайдер и проверка долга — этап 13.
- Авто-перенос визита если сервисник заболел — out of scope (вручную через cancel + create).
- Email-уведомления о визитах/заявках — нет в спеке.
- Resource-view (расписание сервисников рядом, premium FullCalendar) — не нужен.
- Импорт визитов — out of scope.
- Отмена заявки клиентом — запрещено спекой (row 15).

## 10. Риски и mitigation

- **FullCalendar и Next 16 RSC**: `<CalendarView />` помечен `'use client'` и импортируется через `next/dynamic` с `ssr: false` — иначе SSR упадёт.
- **Часовой пояс сервера ≠ Europe/Moscow**: server actions работают строго с UTC `Date`, рендер через `Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow' })`.
- **Месячная серия с краевыми датами**: `date-fns.addMonths` корректно обрабатывает переходы 31 → 28/29/30.
- **Конкурентная приёмка одной заявки двумя сервисниками**: транзакция в `acceptOnlineRequest` проверяет `status === pending` под `SELECT ... FOR UPDATE` (Prisma `$transaction` + `findUnique` с последующим `update where status=pending` — возвращает 0 строк, если уже занято; кидаем понятную ошибку).
