-- Authenticated users only; RLS then further restricts to verified owners.
alter policy "users manage own profile" on public.profiles to authenticated;
alter policy "users manage own categories" on public.categories to authenticated;
alter policy "users manage own transactions" on public.transactions to authenticated;
alter policy "users manage own budgets" on public.budgets to authenticated;
alter policy "users manage own bills" on public.bills to authenticated;
alter policy "users manage own goals" on public.savings_goals to authenticated;
alter policy "users manage own contributions" on public.savings_contributions to authenticated;
alter policy "users manage own activity" on public.activity_history to authenticated;
