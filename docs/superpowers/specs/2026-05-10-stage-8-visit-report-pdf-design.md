# Этап 8 — Визит, отчёт, PDF

> Дата: 2026-05-10
> Статус: дизайн на ревью
> Зависимости: этапы 1–7 (auth, customers, pools, equipment, checklist, calendar)
> Следующий шаг: writing-plans → implementation

## 1. Цель этапа

Сервисник на телефоне открывает запланированный визит, проводит работу, заполняет чек-лист, прикрепляет фото, добавляет доп.работы и химию, выставляет сумму к оплате и завершает визит. По завершении генерируется PDF-отчёт, клиент в личном кабинете видит счёт + html-копию отчёта + ссылку на скачивание PDF.

## 2. Решения (утверждено в брейншторме 2026-05-10)

| # | Вопрос | Ответ |
|---|---|---|
| 1 | Как сервисник начинает визит | Кнопка «Начать визит» (planned → in_progress, фиксируется `startedAt`) |
| 2 | Layout страницы визита | Один длинный скролл, мобильно-first, sticky-bar снизу |
| 3 | Что обязательно для завершения | Все required-вопросы чек-листа + минимум 1 фото |
| 4 | Кто правит после завершения | Админ всегда; сервисник в течение 24ч после `completedAt` |
| 5 | Что происходит при правке | Перегенерация PDF + push клиенту «Отчёт обновлён» |
| 6 | Сумма к оплате | Вводится сервисником/админом вручную при/после завершения; `Visit.totalAmount` |
| 7 | PDF — когда генерируется | Один раз при «Завершить» + перегенерация при правках. Файл хранится на диске |
| 8 | HTML-копия для клиента | `/client/visits/[id]` рендерится из БД (не сохраняем отдельный HTML-файл) |
| 9 | Прайс химии | Модель `ChemistryItem` создаётся в этапе 8 + сидер для тестов; admin-CRUD остаётся в этапе 9 |

## 3. Жизненный цикл визита

```
planned ──[Начать визит]──> in_progress ──[Завершить]──> completed
   │                              │                          │
   │                              │                          ├─[Редактировать]──> in_progress
   │                              │                          │   (admin всегда; service ≤24ч)
   │                              │                          │   при сохранении: PDF re-gen
   │                              │                          │
   │                              │                          └─[(никогда не canceled)]
   │                              │
   │                              ├─[Отмена]──> canceled
   ▼
canceled
```

- **planned** — после создания визита (этап 7, без изменений).
- **in_progress** — сервисник нажал «Начать визит». Заполняет чек-лист, фото, работы, химию, сумму. Может сохраняться промежуточно (autosave при потере фокуса полей).
- **completed** — все required заполнены, сумма указана, PDF сгенерирован.
- **canceled** — отмена возможна только из `planned` или `in_progress` (как в этапе 7), но не из `completed`.

Возврат `completed → in_progress` происходит при нажатии «Редактировать» (повторное завершение генерирует PDF заново).

## 4. Модель данных

### 4.1 Изменения в `Visit`

```prisma
model Visit {
  // ... существующие поля
  startedAt       DateTime?   // когда нажали «Начать визит»
  completedAt     DateTime?   // когда нажали «Завершить»
  totalAmount     Decimal?    @db.Decimal(10, 2)  // сумма к оплате (вводится вручную)
  pdfPath         String?     // относительный путь от uploads/, например "reports-pdf/{visitId}/report.pdf"
  pdfGeneratedAt  DateTime?
  // ... relations
  checklistAnswers VisitChecklistAnswer[]
  photos           VisitPhoto[]
  extraWorks       VisitExtraWork[]
  chemistry        VisitChemistry[]
}
```

### 4.2 Новые модели

```prisma
model VisitChecklistAnswer {
  id         String  @id @default(cuid())
  visitId    String
  questionId String
  // value кодируется как Json для всех типов:
  //   text/number       → { v: "..." }
  //   single_select     → { v: "опция" }
  //   multi_select      → { v: ["опция1", "опция2"] }
  //   bool              → { v: true }
  // wrapper { v: ... } даёт консистентность и упрощает миграции типов в будущем.
  value      Json
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  visit    Visit             @relation(fields: [visitId], references: [id], onDelete: Cascade)
  question ChecklistQuestion @relation(fields: [questionId], references: [id], onDelete: Restrict)

  @@unique([visitId, questionId])
  @@index([visitId])
}

model VisitPhoto {
  id           String   @id @default(cuid())
  visitId      String
  path         String   // "visit-photos/{visitId}/{uuid}.jpg"
  originalName String?
  size         Int?
  width        Int?
  height       Int?
  uploadedAt   DateTime @default(now())

  visit Visit @relation(fields: [visitId], references: [id], onDelete: Cascade)

  @@index([visitId])
}

model VisitExtraWork {
  id        String   @id @default(cuid())
  visitId   String
  name      String
  price     Decimal  @db.Decimal(10, 2)
  order     Int      @default(0)
  createdAt DateTime @default(now())

  visit Visit @relation(fields: [visitId], references: [id], onDelete: Cascade)

  @@index([visitId])
}

model ChemistryItem {
  id        String   @id @default(cuid())
  name      String
  unit      String   // "кг", "л", "шт"
  price     Decimal  @db.Decimal(10, 2)
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  usages VisitChemistry[]

  @@index([active])
}

model VisitChemistry {
  id              String   @id @default(cuid())
  visitId         String
  chemistryItemId String?  // SetNull если позицию удалят/деактивируют после фиксации
  nameAtMoment    String   // снапшот для PDF
  unitAtMoment    String   // снапшот
  priceAtMoment   Decimal  @db.Decimal(10, 2) // снапшот
  qty             Decimal  @db.Decimal(10, 3)
  order           Int      @default(0)
  createdAt       DateTime @default(now())

  visit         Visit          @relation(fields: [visitId], references: [id], onDelete: Cascade)
  chemistryItem ChemistryItem? @relation(fields: [chemistryItemId], references: [id], onDelete: SetNull)

  @@index([visitId])
  @@index([chemistryItemId])
}
```

### 4.3 Сидер `prisma/seeds/chemistry.ts`

Идемпотентный, добавляет 5 базовых позиций:
- Хлор гранулированный, кг, 800 ₽
- Альгицид, л, 600 ₽
- pH-минус, кг, 400 ₽
- pH-плюс, кг, 400 ₽
- Коагулянт, л, 700 ₽

Скрипт `npm run db:seed:chemistry` (по аналогии с `db:seed:checklist`).

### 4.4 Миграция

`{YYYYMMDDhhmmss}_visit_report_init` — добавляет поля в Visit, создаёт 5 новых таблиц. Имя по локальному паттерну (`prisma migrate dev --name visit_report_init` сам подставит timestamp; в этом репо предыдущие миграции — например, `20260508173316_calendar_init`).

## 5. UX страницы визита (`/service/visits/[id]`)

### 5.1 Структура (мобильный скролл, сверху вниз)

```
┌──────────────────────────────────────┐
│ Header (логотип, кнопка выхода)      │
├──────────────────────────────────────┤
│ Метаданные визита (carded)           │
│  Иванов И.И. · «Дача»                │
│  10 мая, 10:00 · Статус: planned     │
├──────────────────────────────────────┤
│ [Начать визит]   ← если planned       │
├──────────────────────────────────────┤
│ Секция «Чек-лист» (если in_progress  │
│  или completed)                       │
│  - 25 вопросов с inline-ответами     │
│  - индикатор required (*)             │
│  - autosave per field on blur         │
├──────────────────────────────────────┤
│ Секция «Фото» (drag-drop + camera)    │
│  - <input capture="environment">      │
│  - сетка 3xN превью                   │
│  - удаление по тапу                   │
│  - server-side compression (sharp)    │
├──────────────────────────────────────┤
│ Секция «Доп.работы»                   │
│  - список рядов (название + цена)     │
│  - кнопка [+ Добавить работу]         │
│  - inline-удаление                    │
├──────────────────────────────────────┤
│ Секция «Химия»                        │
│  - список рядов (Combobox + qty)      │
│  - снапшот цены при выборе            │
│  - кнопка [+ Добавить позицию]        │
├──────────────────────────────────────┤
│ Секция «Сумма к оплате»               │
│  - подсказка: «авто-сумма = ...»      │
│  - input «Итого, ₽» (free-form)       │
├──────────────────────────────────────┤
│ Notes (необязательно)                 │
│  - текстовое поле                     │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│ Sticky bottom-bar (видим всегда)      │
│  «Чек-лист 12/25 · Фото 3 · Сумма ──» │
│             [Завершить визит]         │
└──────────────────────────────────────┘
```

Кнопка «Завершить» в sticky-bar:
- `disabled` пока не выполнены: все required-вопросы заполнены + ≥1 фото + `totalAmount` ≠ null;
- при клике — финальный чек на сервере (на случай гонки), запись `completedAt`, генерация PDF, push клиенту.

### 5.2 Состояния `Visit.status`

| Статус | Что видно | Что доступно |
|---|---|---|
| `planned` | Метаданные, кнопка «Начать визит», секция «Отмена» | Запустить визит, отменить |
| `in_progress` | Все секции редактируемые, sticky-bar | Заполнять, сохранять, отменять, завершать |
| `completed` | Все секции read-only, кнопка «Скачать PDF» | Скачать PDF; «Редактировать» (admin всегда; service если `now - completedAt < 24h`) |
| `canceled` | Метаданные + причина отмены | Только просмотр |

### 5.3 Autosave

Каждое поле чек-листа сохраняется на `blur` через server action `saveChecklistAnswer({visitId, questionId, value})`. Toast «Сохранено» только при ошибке; на success — тихая иконка ✓ возле поля 1.5с.

Доп.работы и химия сохраняются по нажатию «+ Добавить» (создание ряда) и при изменении полей (inline-edit с debounce 500мс).

`totalAmount` — at-blur.

### 5.4 Раздел «Редактировать» для `completed`

Кнопка «Редактировать» в шапке readonly-вида:
- Показывается админу всегда.
- Показывается сервиснику-исполнителю если `Date.now() - visit.completedAt < 24h`.
- При клике: возврат `status → in_progress`, `completedAt → null`, страница в edit-режиме. PDF не удаляется до следующего «Завершить».
- ActivityLog: `visit.edit_after_complete` с `actorId`.

## 6. UX страницы клиента (`/client/visits/[id]`)

Read-only HTML-вид того же отчёта:

```
┌──────────────────────────────────────┐
│ Шапка: «Отчёт о визите»               │
│  Бассейн «Дача», 10 мая 2026          │
│  Сервисник: Петров П.П.               │
├──────────────────────────────────────┤
│ Чек-лист (table-like rendering)       │
│  pH воды: 7.2                         │
│  Уровень Cl: 1.5 мг/л                 │
│  ...                                  │
├──────────────────────────────────────┤
│ Фотогалерея (lightbox при клике)      │
├──────────────────────────────────────┤
│ Доп.работы (таблица)                  │
│  Замена картриджа .......... 1500 ₽   │
│  Очистка форсунок ........... 800 ₽   │
├──────────────────────────────────────┤
│ Химия (таблица)                       │
│  Хлор гранулированный, 5 кг . 4000 ₽  │
├──────────────────────────────────────┤
│ ИТОГО К ОПЛАТЕ:           5000 ₽      │
│                                       │
│ Статус оплаты: Не оплачен             │
│ [Скачать PDF]                         │
└──────────────────────────────────────┘
```

Список визитов клиента `/client/visits` (не входит в этап 7) — добавляется здесь же: таблица «Дата · Бассейн · Сумма · Оплата · Скачать».

Главная клиента `/client` получает виджет «Последние визиты» — 3 последних, ссылка на полный список.

## 7. Генерация PDF

### 7.1 Технология

`@react-pdf/renderer` — JSX-подобный API, серверный рендер в Buffer.

### 7.2 Компонент

`src/lib/pdf/VisitReportPdf.tsx`:

```tsx
<Document>
  <Page size="A4" style={...}>
    <Header>
      <Logo /> {/* SVG/PNG логотипа компании */}
      <Title>ОТЧЁТ О ВИЗИТЕ</Title>
    </Header>
    <Meta>
      Бассейн, клиент, дата, сервисник, длительность
    </Meta>
    <ChecklistTable answers={...} />
    <PhotoGrid photos={...} />     {/* до 12 на странице, перенос если больше */}
    <ExtraWorksTable works={...} />
    <ChemistryTable items={...} />
    <Total amount={...} />
    <Footer>
      ХОРОШИЕ БАССЕЙНЫ · Сочи · {currentYear}
    </Footer>
  </Page>
</Document>
```

### 7.3 Server action `generateVisitPdf(visitId)`

Файл: `src/lib/pdf/generate-visit-pdf.ts`

```ts
export async function generateVisitPdf(visitId: string): Promise<{path: string}> {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    include: {
      pool: { include: { customer: true } },
      serviceUser: true,
      checklistAnswers: { include: { question: true }, orderBy: { question: { order: "asc" } } },
      photos: true,
      extraWorks: { orderBy: { order: "asc" } },
      chemistry: { orderBy: { order: "asc" } },
    },
  });
  if (!visit) throw new Error("Visit not found");

  const pdfBuffer = await renderToBuffer(<VisitReportPdf visit={visit} />);

  const dir = path.join(process.cwd(), "uploads", "reports-pdf", visitId);
  await mkdir(dir, { recursive: true });
  const filepath = path.join(dir, "report.pdf");
  await writeFile(filepath, pdfBuffer);

  await prisma.visit.update({
    where: { id: visitId },
    data: {
      pdfPath: `reports-pdf/${visitId}/report.pdf`,
      pdfGeneratedAt: new Date(),
    },
  });

  return { path: `reports-pdf/${visitId}/report.pdf` };
}
```

Фото в PDF: читаем файлы из `uploads/visit-photos/{visitId}/...`, передаём как `<Image src={absolutePath}>`. Если файл удалён по cron-ретенции (90 дней), пропускаем с placeholder «фото удалено по ретенции».

### 7.4 Размещение в файлах

```
uploads/
├── pool-photos/{poolId}/...
├── visit-photos/{visitId}/...     ← новое
└── reports-pdf/{visitId}/report.pdf  ← новое
```

PDF хранится бесконечно (см. spec.md §6), фото визита — 90 дней (cron в этапе 15).

### 7.5 Доступ через `/api/files/[...path]`

Расширяем `src/app/api/files/[...path]/route.ts`:

- `area === "visit-photos"`: client разрешён только если `visit.pool.customer.userId === session.user.id`.
- `area === "reports-pdf"`: то же правило.
- service/admin — всё.

## 8. Server actions

Файл: `src/lib/server-actions/visit-report.ts`

```ts
"use server";

// 1. Старт визита
export async function startVisitAction(visitId: string): Promise<void>
//   - require staff, status === "planned"
//   - update status: "in_progress", startedAt: new Date()
//   - logActivity("visit.started")
//   - revalidate

// 2. Сохранить ответ чек-листа (autosave)
export async function saveChecklistAnswerAction(input: {
  visitId: string;
  questionId: string;
  value: ChecklistValue; // typed union
}): Promise<{ ok: true } | { ok: false; error: string }>
//   - require staff + ownership (admin/service)
//   - status должен быть in_progress
//   - upsert VisitChecklistAnswer
//   - НЕ перевалидируем страницу (autosave)

// 3. Загрузка фото (FormData)
export async function uploadVisitPhotosAction(formData: FormData): Promise<void>
//   - similar to uploadPoolPhotosAction
//   - sharp resize: max 2000px, jpeg q85
//   - сохраняем width/height в БД

// 4. Удаление фото
export async function deleteVisitPhotoAction(formData: FormData): Promise<void>

// 5. CRUD доп.работ
export async function addExtraWorkAction(visitId: string, name: string, price: number): Promise<void>
export async function updateExtraWorkAction(id: string, name: string, price: number): Promise<void>
export async function deleteExtraWorkAction(id: string): Promise<void>

// 6. CRUD химии
export async function addChemistryAction(visitId: string, chemistryItemId: string, qty: number): Promise<void>
//   - читает текущую цену/имя/единицу из ChemistryItem → пишет в *AtMoment
export async function updateChemistryQtyAction(id: string, qty: number): Promise<void>
export async function deleteChemistryAction(id: string): Promise<void>

// 7. Сохранить итоговую сумму
export async function saveTotalAmountAction(visitId: string, amount: number): Promise<void>

// 8. Завершить визит
export async function completeVisitAction(visitId: string): Promise<void>
//   - require staff
//   - validate: все required-вопросы отвечены, ≥1 фото, totalAmount != null
//   - status = "completed", completedAt = new Date()
//   - generateVisitPdf(visitId)
//   - enqueuePush("visit_report_ready", [client], { visitId })
//   - logActivity("visit.completed")
//   - redirect to /service/visits/[id]?ok=Завершено

// 9. Открыть редактирование завершённого
export async function reopenVisitAction(visitId: string): Promise<void>
//   - admin always; service if Date.now() - completedAt < 24h
//   - status = "in_progress", completedAt = null (pdfPath остаётся, заменится при следующем complete)
//   - logActivity("visit.reopened")
}
```

Push-стаб (`src/lib/push/stub.ts`) расширяем — добавляем в union `PushKind` два новых значения:
- `visit_report_ready` — клиенту, после первой completion;
- `visit_report_updated` — клиенту, после re-completion после edit.

Реальная отправка появится в этапе 12 — точки вызова не меняются.

## 9. Валидация

Server-side проверки в `completeVisitAction` (single source of truth):

1. **Required-вопросы**: загружаем все `ChecklistQuestion.where({active: true, required: true})`, проверяем что для каждого есть `VisitChecklistAnswer` с непустым value:
   - text/number: не пустая строка
   - single_select: не null
   - multi_select: массив длиной ≥1
   - bool: ровно `true` или `false` (просто not null)
2. **Фото**: `count(VisitPhoto.where({visitId})) >= 1`
3. **Сумма**: `totalAmount != null && totalAmount >= 0`

Если что-то не выполнено — возвращаем `{ ok: false, error: "Не заполнены: ..." }`. На клиенте кнопка `disabled`, но finalCheck на сервере ловит race.

Client-side валидация (только UX): live-progress в sticky-bar, disabled-state кнопки.

## 10. Activity Log

Новые actions:
- `visit.started` (entityType: "Visit")
- `visit.completed` (diff: `{ totalAmount, photoCount, extraWorksCount, chemistryCount, requiredAnswered }`)
- `visit.reopened`
- `visit.photo.upload` (diff: `{ saved, skipped }`) / `visit.photo.delete`
- `visit.extra_work.create/update/delete`
- `visit.chemistry.add/update/delete`
- `visit.total_amount.update`
- `visit.pdf.generated`

**Не логируем** каждый upsert ответа чек-листа (autosave создаёт ~25 записей за визит — флуд). Сводка по чек-листу попадает в diff `visit.completed`. Для аудита достаточно: «когда стартовал, когда завершил, что в итоге получилось».

## 11. Права доступа

| Роль | Старт | Заполнение | Завершить | Редактировать после | Просмотр PDF |
|---|---|---|---|---|---|
| admin | ✓ | ✓ | ✓ | ✓ всегда | ✓ |
| service | ✓ (любой) | ✓ (любой) | ✓ (любой) | ✓ ≤24ч после completedAt **только свой** | ✓ |
| client | – | – | – | – | ✓ только свои визиты |

«Только свой визит» для service-redacting = `visit.serviceUserId === session.user.id`. Админ — без ограничений.

## 12. UI-компоненты

Новые:
- `src/components/visit/VisitChecklistSection.tsx` — обёртка над `ChecklistFieldRenderer` с per-field autosave.
- `src/components/visit/VisitPhotosSection.tsx` — drag-drop, capture-камера, превью, удаление.
- `src/components/visit/VisitExtraWorksSection.tsx` — таблица + add/delete.
- `src/components/visit/VisitChemistrySection.tsx` — Combobox (поиск по `ChemistryItem.where({active: true})`) + qty.
- `src/components/visit/VisitTotalSection.tsx` — input «Итого» + подсказка авто-суммы.
- `src/components/visit/VisitStickyBar.tsx` — sticky bottom-bar с прогрессом и кнопкой «Завершить».
- `src/components/visit/VisitReadOnlyView.tsx` — HTML-копия отчёта для `/client/visits/[id]` и для read-only state в `/service/visits/[id]`.
- `src/lib/pdf/VisitReportPdf.tsx` — react-pdf компонент.
- `src/lib/pdf/generate-visit-pdf.ts` — серверная функция генерации.

Переиспользуем:
- `ChecklistFieldRenderer` (этап 6) — без изменений.
- `Header`, `PageContainer`, `Card`, `Alert`, `Button`, `Input` (этап 1).

**Combobox**: shadcn-компонента ещё нет в `src/components/ui/`. В плане первым шагом добавляем `npx shadcn@latest add command popover` и собираем простой Combobox (по официальному рецепту shadcn) поверх. Альтернатива на этап MVP — обычный `<select>` с фильтр-инпутом сверху, если Combobox даст тормоза в плане.

## 13. Тестирование (manual + integration)

Manual smoke-test (для чекпойнта):

1. Сервисник логинится → открывает визит из этапа 7 → жмёт «Начать».
2. Заполняет 25 вопросов чек-листа (autosave).
3. Прикладывает 2 фото с камеры телефона.
4. Добавляет «Замена картриджа — 1500 ₽».
5. Добавляет «Хлор гранулированный — 5 кг».
6. Вводит «Итого: 7500 ₽».
7. Жмёт «Завершить» → видит PDF в `uploads/reports-pdf/{id}/report.pdf`, статус «completed».
8. Открывает PDF — все секции присутствуют, логотип, дата, сумма, фото видны.
9. Логинится как клиент → `/client/visits/[id]` → видит HTML-вид + ссылку «Скачать PDF» → скачивает → открывается.
10. Возвращается админом → жмёт «Редактировать» → меняет сумму на 7000 → «Завершить» → PDF перегенерирован.
11. Сервисник через 25 часов после `completedAt` → кнопки «Редактировать» нет.

Edge cases:
- Завершить визит без фото → `disabled`, серверный finalCheck возвращает ошибку.
- Удалить ChemistryItem после фиксации в визите → `chemistryItemId = null`, но `nameAtMoment/priceAtMoment` сохранены, PDF корректен.
- Деактивировать ChecklistQuestion после ответа → ответ остаётся в БД, в PDF показывается, но в форме нового визита уже не появляется.

Type-check (`tsc --noEmit`), `next build` чистые.

## 14. Что НЕ входит в этап 8

- Admin-CRUD прайса химии (этап 9).
- Реальный Web Push (заглушка через ActivityLog, как в этапе 7; реальный — этап 12).
- Платёжный флоу (paid/unpaid/online_pending) — этап 13. Сейчас просто хранится `totalAmount` без статуса оплаты, в HTML-вьюхе пишем «Не оплачен» как текст-плейсхолдер.
- Реестр ответов всех визитов (`/admin/registry/checklists`) — этап 10.
- Email-отправка PDF — спека упоминает «push + email», но email отложим до этапа 12 (вместе с push); пока только в-приложении.
- Cron-удаление фото >90 дней — этап 15.

## 15. Открытые риски и допущения

- **react-pdf и шрифты с кириллицей**: дефолтные шрифты не покрывают кириллицу. Нужно зарегистрировать шрифт (Inter/Roboto через `Font.register`) и положить .ttf в `public/fonts/` или в `src/lib/pdf/fonts/`. Лицензии — Inter/Roboto OFL.
- **Логотип**: spec.md §10/2.25 говорит «Название "ХОРОШИЕ БАССЕЙНЫ" в PDF». Используем текстовый логотип в шапке (никаких бренд-ассетов клиент пока не дал). Если клиент даст SVG/PNG — заменим в одну правку.
- **sharp на Windows**: уже зависимость Next.js Image, конфликтов быть не должно. Если pdf-pipeline на Windows-разработке вылетит — fallback: пропускать ресайз и сохранять оригинал. В деплой-этапе (16) будет Linux-контейнер.
- **PDF при concurrent re-completion**: маловероятно, но если два админа жмут «Завершить» одновременно — последний победит. Достаточно для MVP.
- **Порядок чек-листа в PDF** — берём из `ChecklistQuestion.order` (как в forme), скрытые/деактивированные показываем только если на них есть ответ.

## 16. Критерий приёмки (чекпойнт)

> Сервисник с телефона открывает запланированный визит → жмёт «Начать» → заполняет чек-лист → прикрепляет 2 фото с камеры → добавляет «Замена картриджа — 1500 ₽» и «Хлор 5 кг» → вводит сумму → жмёт «Завершить» → клиент в `/client/visits/[id]` видит HTML-копию отчёта + кнопку «Скачать PDF» → PDF скачивается, открывается, содержит логотип, дату, чек-лист, фото, таблицу работ+химии, итоговую сумму. Админ заходит в визит → «Редактировать» → меняет сумму → «Завершить» → клиент получает push «Отчёт обновлён».
