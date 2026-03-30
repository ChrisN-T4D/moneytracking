# Addendum: Add items – wizard, sections, single selector

Use this with the main plan (Spanish Fork mobile, Summary next 2 weeks). It replaces and expands **Section 2** of that plan.

**Design rule:** The system matches statement rows to **existing groups only**. Auto-tag rules (and learning from past tags) assign rows to existing bills/subs; the UI only lets users pick from existing groups (or Variable expenses / Ignore). This flow does **not** create new groups—new groups are added elsewhere (e.g. main page or PocketBase).

---

## 2. Statement flow: wizard + Add items redesign

### 2a. Wizard (Upload → Paychecks → Add items)

**Goal:** One guided flow: (1) upload statements, (2) that month's paychecks to add, (3) add items to bills (load and categorize).

**Implementation:** Add a "Start wizard" or "Import and categorize" entry on [app/statements/page.tsx](app/statements/page.tsx) that runs a **3-step wizard**:

- **Step 1 – Upload:** Reuse existing "Import and analyze": pick files, import CSV/PDF.
- **Step 2 – Paychecks:** Auto-run analyze if needed; show "Fill main page from statements" paychecks list for the current month; user selects and adds paychecks.
- **Step 3 – Add items:** Open or embed the Add items UI with rows already loaded (AddItemsToBillsModal in controlled mode, or same tagging UI used on Statements page).

Use step indicators (e.g. "Step 1 of 3") and Next/Back. Completing step 1 enables step 2; completing step 2 enables step 3. No new API; wire to existing import, fill-from-statements, and statement-tags APIs.

---

### 2b. Add items modal: sections, colors, groups, single selector

**File:** [components/AddItemsToBillsModal.tsx](components/AddItemsToBillsModal.tsx) (and any shared tagging UI on the Statements page).

**Sections**

- **Already saved** – Rows that have been saved this session or are already tagged and persisted. Show in one distinct block (e.g. collapsible or clearly headed list).
- **New (sorted by date)** – Rows that still need categorization or have not been saved. Sort by date (newest or oldest; pick one). Show in a separate block (e.g. above or below "Already saved").
- **Auto vs manual color** – Different background/border for **auto-tagged** rows (from rules) vs **manually** chosen rows: e.g. auto = subtle green/emerald, manual = neutral or blue. Use existing `hasMatchedRule` / confidence to apply a class per row.

**Match to existing groups only – no creating groups**

- **Principle:** The system should **match rows to existing groups automatically** (via auto-tag rules / learned rules). The UI does **not** support creating new groups here—everything must match an existing group (or Variable expenses / Ignore). New groups are created elsewhere (e.g. main page bills list or PocketBase) when you add a new bill; Add items only assigns statement rows to those existing groups.
- **Dropdown:** Lists only **existing** groups (from PocketBase). Remove "— Add new subsection —" and any "Add group…" option. User can only choose: Variable expenses, Ignore, or one of the existing bill/sub names (by account optgroup).

**Single selector (account implied from group)**

- **Current:** Three controls – Type (Bill / Sub / Spanish Fork / Variable / Ignore), Section (Bills Account / Checking / Spanish Fork), Bill name. Redundant and easy to mis-pick.
- **Target – one control (existing groups only):**
  - **Variable expenses** – One option; sets `targetType = variable_expense`.
  - **Ignore** – One option; sets `targetType = ignore`.
  - **Existing groups by account** – One dropdown with **optgroups** (no "Add group" entry):
    - "Bills (Bills Account)" → existing bill names
    - "Subscriptions (Bills Account)" → existing sub names
    - "Bills (Checking)" → existing bill names
    - "Subscriptions (Checking)" → existing sub names
    - "Spanish Fork" → existing Spanish Fork bill names
  - Selecting a bill/sub name **auto-sets** `targetSection` and `targetType` (bill vs subscription). User only picks from existing groups.
- **Data:** Build options from existing `billNames` (or equivalent). On change, map the selected value to `targetType`, `targetSection`, `targetName`. No API change. Do not expose or persist "new subsection" creation in this flow.

**Copy and actions**

- Short explanation at top: e.g. "Assign each row to a bill, variable expenses, or ignore. Save when done."
- Primary actions: Load when empty, then Save / Save all. Auto-tag and Reset remain available but secondary.
