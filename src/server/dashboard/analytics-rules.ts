import { cents, money } from "../finance/money";
export function completionRate(completed: number, eligible: number): string | null {
  return eligible === 0 ? null : (completed / eligible * 100).toFixed(1);
}
export function monthlyWindows(today: string, count = 6) {
  const year = Number(today.slice(0,4)), month = Number(today.slice(5,7)) - 1;
  return Array.from({length: count}, (_, i) => {
    const start = new Date(Date.UTC(year, month - count + 1 + i, 1));
    const end = new Date(Date.UTC(year, month - count + 2 + i, 1));
    return { label: start.toISOString().slice(0,7), start, end };
  });
}
/** Only budgeted projects contribute to remaining budget/utilization. Unbudgeted costs stay visible separately. */
export function portfolioFinance(budgets: readonly {projectId:string; amount:string}[], expenses: readonly {projectId:string; amount:string}[]) {
  const approved = new Map(budgets.map(b => [b.projectId, cents(b.amount)]));
  const actual = new Map(expenses.map(e => [e.projectId, cents(e.amount)]));
  let budget = 0n, total = 0n, budgetedSpend = 0n, unbudgetedSpend = 0n, overBudget = 0;
  for (const [id, amount] of approved) {
    budget += amount;
    const spent = actual.get(id) ?? 0n;
    budgetedSpend += spent;
    if (spent > amount) overBudget++;
  }
  for (const [id, amount] of actual) { total += amount; if (!approved.has(id)) unbudgetedSpend += amount; }
  return { approved: money(budget), actual: money(total), remaining: approved.size ? money(budget-budgetedSpend) : null,
    utilization: budget === 0n ? null : money((budgetedSpend * 10000n + budget / 2n) / budget),
    unbudgetedSpend: money(unbudgetedSpend), overBudget, budgetedProjects: approved.size };
}
