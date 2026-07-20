import type { GroceriesAndGasPeriod } from "./groceriesBudget";

export type MoneyHealthStatus = "tight" | "ok" | "comfortable";

export type MoneyHealthAccount = {
  key: string;
  label: string;
  balance: number | null;
  projected: number | null;
  required: number;
};

export type MoneyHealth = {
  status: MoneyHealthStatus;
  groceriesBudget: number;
  groceriesSpent: number;
  groceriesRemaining: number;
  flexibleLeftover: number;
  flexibleLeftoverDisplay: number;
  checkingProjected: number | null;
  checkingRequired: number;
  anyAccountShort: boolean;
  statusLines: string[];
  payPeriodStartYmd: string | null;
  payPeriodEndYmd: string | null;
};

function fmtMoney(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return `$${rounded}`;
}

export function buildMoneyHealth(options: {
  accounts: MoneyHealthAccount[];
  groceries: GroceriesAndGasPeriod;
  nextPaydayLabel: string | null;
  dataNotes: string[];
}): MoneyHealth {
  const { accounts, groceries, nextPaydayLabel, dataNotes } = options;
  const checking = accounts.find((a) => a.key === "checking");
  const checkingProjected = checking?.projected ?? null;
  const checkingRequired = checking?.required ?? 0;

  const anyAccountShort = accounts.some(
    (a) => a.projected != null && a.projected < a.required
  );

  const checkingUnknown = checking != null && checking.projected == null && checking.balance == null;
  if (checkingUnknown) {
    dataNotes.push("Checking balance unknown â€” flexible leftover may be incomplete.");
  }
  if (groceries.periodStartYmd == null) {
    dataNotes.push("No biweekly payday found â€” groceries envelope used budget with $0 spent.");
  }

  let flexibleLeftover = 0;
  if (checkingUnknown) {
    flexibleLeftover = 0;
  } else {
    const base = checkingProjected ?? checking?.balance ?? 0;
    flexibleLeftover =
      Math.round((base - checkingRequired - groceries.remaining) * 100) / 100;
  }
  const flexibleLeftoverDisplay = Math.max(0, flexibleLeftover);

  const groceriesExhausted =
    groceries.remaining === 0 && groceries.spent >= groceries.budget;

  let status: MoneyHealthStatus = "ok";
  if (anyAccountShort || flexibleLeftover < 0 || groceriesExhausted) {
    status = "tight";
  } else if (
    !checkingUnknown &&
    !anyAccountShort &&
    flexibleLeftover >= groceries.budget
  ) {
    status = "comfortable";
  }

  const until = nextPaydayLabel ?? "next payday";
  const statusLines: string[] = [];
  if (status === "tight") statusLines.push(`Tight until ${until}.`);
  else if (status === "comfortable") statusLines.push(`Comfortable cushion until ${until}.`);
  else statusLines.push(`On track until ${until}.`);

  statusLines.push(
    `Groceries & Gas: ${fmtMoney(groceries.remaining)} left of ${fmtMoney(groceries.budget)} this paycheck (${fmtMoney(groceries.spent)} spent).`
  );

  if (flexibleLeftover < 0) {
    statusLines.push(
      `Short ~${fmtMoney(Math.abs(flexibleLeftover))} after must-pays and groceries â€” cut optionals or delay spend.`
    );
  } else {
    statusLines.push(
      `After must-pays and groceries left, about ${fmtMoney(flexibleLeftoverDisplay)} flexible for other spending.`
    );
  }

  if (anyAccountShort) {
    const shortLabels = accounts
      .filter((a) => a.projected != null && a.projected < a.required)
      .map((a) => a.label);
    if (shortLabels.length) {
      statusLines.push(`Short vs required: ${shortLabels.join(", ")}.`);
    }
  }

  return {
    status,
    groceriesBudget: groceries.budget,
    groceriesSpent: groceries.spent,
    groceriesRemaining: groceries.remaining,
    flexibleLeftover,
    flexibleLeftoverDisplay,
    checkingProjected,
    checkingRequired,
    anyAccountShort,
    statusLines,
    payPeriodStartYmd: groceries.periodStartYmd,
    payPeriodEndYmd: groceries.periodEndYmd,
  };
}
