# Этап 6 — Чек-лист (динамическая схема). Дизайн

> Дата: 2026-05-08
> Связанные документы: [`spec.md`](../../../spec.md), [`plan.md`](../../../plan.md) (этап 6)
> Источник вопросов: https://docs.google.com/forms/d/1yjJagwQEUAJULj6aQxYc7707MUDbIV_ev1alBJ-Is9s/viewform

---

## 1. Цель

Дать админу управление списком вопросов чек-листа сервисного обслуживания: создание, редактирование, drag-drop сортировка, мягкое удаление. Сидер наполняет список из существующей Google-формы (25 вопросов после фильтрации дубликатов с моделью `Visit`). На этом этапе **только конфигурация**; модель ответов (`ChecklistAnswer`) и сама форма заполнения визита — этап 8.

## 2. Принятые решения

| # | Решение | Обоснование |
|---|---|---|
| 1 | Required-флаг на уровне вопроса | pH/хлор пропускать нельзя |
| 2 | 5 типов вопросов: `text`, `number`, `single_select`, `multi_select`, `bool` | `multi_select` нужен для одного вопроса формы («Работа насосных агрегатов»); `bool` — для «ВЫПОЛНЕНА»-чекбокса |
| 3 | Правка label / опций — в лоб, без версионирования | Старые ответы покажут актуальный label. Версионирование в этой CRM — overkill |
| 4 | Удаление — только soft (`active=false`) | Жёсткое удаление сломает старые визиты этапа 8 |
| 5 | Drag-drop через `@dnd-kit/core` + `@dnd-kit/sortable` | React-19-совместимая, тач-френдли |
| 6 | Дубликаты с `Visit` (СОТРУДНИК / ДАТА / НАЗВАНИЕ ОБЪЕКТА / ОТПРАВКА ФОТООТЧЁТА) — выкидываем | Уже хранятся в `Visit`; при PDF подставим оттуда |
| 7 | pH / хлор / щёлочность / давление — `number`, не `text` | Валидация формата + потенциал графиков динамики |
| 8 | `options` хранится как `Json` (массив строк) | Быстро, гибко; FK на опции не нужен (правим в лоб) |
| 9 | Превью «как видит сервисник» — переиспользуемый компонент `ChecklistFieldRenderer` | На этапе 8 этот же компонент рендерит форму визита |

## 3. Схема БД

Миграция: `20260508_checklist_init`.

```prisma
enum ChecklistQuestionType {
  text
  number
  single_select
  multi_select
  bool
}

model ChecklistQuestion {
  id          String                @id @default(cuid())
  order       Int
  type        ChecklistQuestionType
  label       String
  placeholder String?
  unit        String?               // только для type=number ("мг/л", "бар")
  options     Json?                 // string[] — только для *_select
  required    Boolean               @default(true)
  active      Boolean               @default(true)
  createdAt   DateTime              @default(now())
  updatedAt   DateTime              @updatedAt

  @@index([order])
  @@index([active])
}
```

**Инварианты (валидируются server actions, не БД-уровнем):**
- `unit` заполнен ⇒ `type === number`.
- `options` непуст и длина ≥ 2 ⇒ `type ∈ {single_select, multi_select}`.
- `placeholder` допустим для `text` и `number`; для остальных типов игнорируется.

## 4. Сидер

Файл: `prisma/seeds/checklist.ts`. Запускается одной командой (`npm run db:seed:checklist` — добавить в `package.json`). Идемпотентный: если в `ChecklistQuestion` уже есть записи — выходит без действий, чтобы не переписать ручные правки админа.

Полный список вопросов (после очистки):

| order | label | type | required | unit | options |
|---|---|---|---|---|---|
| 1 | УРОВЕНЬ pH | number | ✓ | — | — |
| 2 | УРОВЕНЬ СВОБОДНОГО ХЛОРА | number | ✓ | мг/л | — |
| 3 | УРОВЕНЬ СВЯЗАННОГО ХЛОРА | number | ✓ | мг/л | — |
| 4 | УРОВЕНЬ ЩЁЛОЧНОСТИ | number | ✓ | мг/л | — |
| 5 | СОДЕРЖАНИЕ СОЛИ | number | ✗ | г/л | — |
| 6 | УРОВЕНЬ ЦИАНУРОВОЙ КИСЛОТЫ | number | ✗ | мг/л | — |
| 7 | ПРОМЫВКА ФИЛЬТРА | bool | ✓ | — | — |
| 8 | ДАВЛЕНИЕ В СИСТЕМЕ ФИЛЬТРАЦИИ | number | ✓ | бар | — |
| 9 | РАБОТА НАСОСНЫХ АГРЕГАТОВ | multi_select | ✓ | — | НОРМАЛЬНАЯ / ПОСТОРОННИЕ ШУМЫ / ПЕРЕГРЕВ / НЕОБХОДИМ РЕМОНТ |
| 10 | СОСТОЯНИЕ ДОННОГО ПЫЛЕСОСА | single_select | ✓ | — | ИСПРАВЕН / ТРЕБУЕТ РЕМОНТА ИЛИ ЗАМЕНЫ |
| 11 | РАБОТА ЭЛЕКТРИЧЕСКОГО ЩИТА | single_select | ✓ | — | НОРМАЛЬНО / ТРЕБУЕТ ВНИМАНИЯ |
| 12 | РАБОТА АВТОМАТИЧЕСКОГО ДОЛИВА ВОДЫ | single_select | ✓ | — | НОРМАЛЬНО / ТРЕБУЕТ НАСТРОЙКИ / НЕИСПРАВНО / ОТКЛЮЧЕНО |
| 13 | ПОДОГРЕВ В БАССЕЙНЕ | single_select | ✓ | — | НОРМАЛЬНО / ТРЕБУЕТ ВНИМАНИЯ / НЕИСПРАВНО |
| 14 | ПОДСВЕТКА БАССЕЙНА | single_select | ✓ | — | ИСПРАВНА / ТРЕБУЕТ РЕМОНТА |
| 15 | РАБОТА АТТРАКЦИОНОВ | single_select | ✓ | — | НОРМАЛЬНО / ТРЕБУЕТ ВНИМАНИЯ / НЕИСПРАВНО |
| 16 | СОСТОЯНИЕ ТЕПЛОСБЕРЕГАЮЩЕГО ПОКРЫТИЯ | single_select | ✓ | — | НОРМАЛЬНО / ТРЕБУЕТ ВНИМАНИЯ / НЕИСПРАВНО |
| 17 | АВТОМАТИЧЕСКОЕ ДОЗИРОВАНИЕ РЕАГЕНТОВ | single_select | ✓ | — | РАБОТАЕТ / ТРЕБУЕТ ОБСЛУЖИВАНИЯ |
| 18 | СОСТОЯНИЕ ЗАКЛАДНЫХ ЭЛЕМЕНТОВ | single_select | ✓ | — | НОРМАЛЬНО / ТРЕБУЕТ ВНИМАНИЯ |
| 19 | УБОРКА ЧАШИ БАССЕЙНА | single_select | ✓ | — | ВЫПОЛНЕНА / НЕ ТРЕБУЕТСЯ |
| 20 | УБОРКА БОРТОВОГО КАМНЯ | single_select | ✓ | — | ВЫПОЛНЕНА / НЕ ТРЕБУЕТСЯ |
| 21 | УБОРКА ТЕХНИЧЕСКОГО ПОМЕЩЕНИЯ | single_select | ✓ | — | ВЫПОЛНЕНА / НЕ ТРЕБУЕТСЯ |
| 22 | СОСТОЯНИЕ ОБЛИЦОВОЧНЫХ ПОКРЫТИЙ | single_select | ✓ | — | НОРМАЛЬНО / ТРЕБУЕТ ВНИМАНИЯ |
| 23 | СОСТОЯНИЕ ПЕРЕЛИВНОЙ ЁМКОСТИ | single_select | ✓ | — | НОРМАЛЬНО / ТРЕБУЕТ ВНИМАНИЯ |
| 24 | РУЧНОЕ ВНЕСЕНИЕ ХИМИЧЕСКИХ РЕАГЕНТОВ | text | ✓ | — | — |
| 25 | ЗАПАС ХИМИЧЕСКИХ РЕАГЕНТОВ | single_select | ✓ | — | ДОСТАТОЧНО / ТРЕБУЕТ ПОПОЛНЕНИЯ |

**Важно:** опции для вопросов 11–18 — разумные плейсхолдеры. Точные формулировки админ правит через UI после первого запуска (или допишет в сидере перед запуском, если откроет полную форму).

## 5. Backend — server actions

Файл: `src/lib/server-actions/checklist.ts`. В каждом action — проверка по существующему паттерну проекта: `if (!session?.user || session.user.role !== "admin") throw new Error("Forbidden")` (как в `equipment-templates.ts`). Каждая запись логирует событие в `ActivityLog`.

| Action | Сигнатура | Что делает | ActivityLog |
|---|---|---|---|
| `createQuestion` | `(data: ChecklistQuestionInput)` | Создаёт вопрос, `order = max(order)+1` | `checklist.question.create` |
| `updateQuestion` | `(id, data: ChecklistQuestionInput)` | Обновляет (label/type/options/required/unit/placeholder) | `checklist.question.update` |
| `reorderQuestions` | `(ids: string[])` | Транзакция: обновляет `order` в порядке массива | `checklist.question.reorder` |
| `setActive` | `(id, active: boolean)` | Toggle | `checklist.question.activate` / `.deactivate` |

**Валидация (zod):**
```ts
const ChecklistQuestionInput = z.object({
  type: z.nativeEnum(ChecklistQuestionType),
  label: z.string().min(1).max(200),
  placeholder: z.string().max(100).optional(),
  unit: z.string().max(20).optional(),
  options: z.array(z.string().min(1)).optional(),
  required: z.boolean(),
}).refine(...) // инварианты из секции 3
```

## 6. Frontend

### Структура

```
src/app/admin/checklist/page.tsx                     ← server-component, грузит вопросы
src/components/checklist/ChecklistAdminList.tsx      ← @dnd-kit sortable list (client)
src/components/checklist/ChecklistQuestionForm.tsx   ← Dialog create/edit (client)
src/components/checklist/ChecklistFieldRenderer.tsx  ← рендер ОДНОГО вопроса (reusable, client)
src/components/checklist/ChecklistPreview.tsx        ← рендер всего списка как форма (reusable)
```

### `/admin/checklist`

Tabs (shadcn): **Активные** | **Скрытые** | **Превью**.

**Вкладка «Активные»:** drag-drop список (`@dnd-kit`). Каждая карточка:
```
≡  [тип-бейдж]  Label                              [✏️ Изменить]  [👁️‍🗨️ Скрыть]
   Обязательно ✓   Опции: 4   Единица: мг/л
```
- На drop → клиент собирает массив id в новом порядке → `reorderQuestions(ids)`.
- Кнопка `+ Добавить вопрос` сверху → открывает `ChecklistQuestionForm` в режиме `create`.

**Вкладка «Скрытые»:** список деактивированных. Кнопки: `👁️ Показать` / `✏️ Изменить`. Drag-drop не нужен.

**Вкладка «Превью»:** рендерит `ChecklistPreview` со всеми активными вопросами. Сверху баннер: «Так увидит чек-лист сервисник на визите». Без submit-кнопки.

### `ChecklistQuestionForm`

Dialog с полями:
- **Тип** — `RadioGroup` с 5 опциями.
- **Текст вопроса** (label) — `Input`.
- **Обязательный** — `Switch`.
- **Подсказка** (placeholder) — `Input`, видно при типах text/number.
- **Единица** (unit) — `Input`, видно при типе number.
- **Варианты** (options) — динамический список `Input`'ов с кнопками `+` / `🗑️`, видно при типах `*_select`. Минимум 2.

Кнопки: **Сохранить** | **Отмена**.

### `ChecklistFieldRenderer` (reusable, для этапа 8 тоже)

Принимает `question: ChecklistQuestion` и `value` (контролируемый). Рендерит:
- `text` → `<input type="text" placeholder={placeholder}>`
- `number` → `<input type="number" step="0.1" placeholder>` + `<span>{unit}</span>` справа. Запятая в вводе → точка автоматически.
- `single_select` → `RadioGroup` из options
- `multi_select` → набор `Checkbox` из options
- `bool` → одна `Checkbox` с текстом «ВЫПОЛНЕНО» (либо custom — заданный label)

Required-индикатор (`*`) рядом с label.

## 7. ActivityLog actions

Все события пишутся в существующую модель `ActivityLog`:
- `checklist.question.create`
- `checklist.question.update`
- `checklist.question.reorder` (один раз на drop, в diff — массив id)
- `checklist.question.activate`
- `checklist.question.deactivate`

## 8. Не входит в этап 6

- Модель `ChecklistAnswer` и хранение ответов — этап 8.
- Любые правки UI визита — этап 8.
- Реестр чек-листов с экспортом — этап 10.
- Версионирование вопросов — никогда (сознательное решение).
- Жёсткое удаление вопросов — никогда (мягкое soft-delete).

## 9. Edge cases и проверки

| Случай | Поведение |
|---|---|
| Админ переименовал label вопроса с существующими ответами в БД (после этапа 8) | Старые ответы при отображении показывают новый label. История не сохраняется. |
| Админ убрал опцию из `single_select`, на которую ссылаются старые ответы | Ответ остаётся как строковое значение в `ChecklistAnswer.value`, рендерится как есть с пометкой «(вариант удалён)». Реализуется в этапе 8. |
| Админ деактивировал обязательный вопрос → новый визит не требует его | OK; при заполнении визита показываются только `active=true`. |
| Сидер запущен на не-пустой таблице | No-op (count > 0 → выход с сообщением). |
| Drag-drop при concurrent-правке двух админов | Last-write-wins по `order`. Конфликты редки на ~25 вопросах, отдельной блокировки не делаем. |
| `reorderQuestions` получает id, которого нет в БД | Транзакция откатывается, server action возвращает ошибку. |

## 10. Чекпойнт (как в `plan.md`)

> Админ открывает `/admin/checklist` → видит 25 вопросов из формы → меняет порядок drag-drop'ом → добавляет новый вопрос «Уровень pH запас (число, мг/л)» → видит его в превью.

Дополнительно: Type-check (`tsc --noEmit`), lint (`next lint`), `next build` чистые.
