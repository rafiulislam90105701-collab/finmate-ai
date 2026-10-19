-- FinMate AI: explicit Data API permissions, RLS-policy hardening, and
-- foreign-key indexes. Required because current Supabase projects may not grant
-- Data API access to newly created public tables by default.

-- Keep authenticated app access explicit, while anonymous clients receive no
-- table access. RLS below supplies the per-user boundary.
revoke all on table
  public.profiles,
  public.categories,
  public.transactions,
  public.budgets,
  public.bills,
  public.savings_goals,
  public.savings_contributions,
  public.activity_history
from public, anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table
  public.profiles,
  public.categories,
  public.transactions,
  public.budgets,
  public.bills,
  public.savings_goals,
  public.savings_contributions,
  public.activity_history
to authenticated;

-- Scope every policy to authenticated sessions and evaluate auth.uid() once per
-- statement rather than once per row.
alter policy "users manage own profile" on public.profiles
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
alter policy "users manage own categories" on public.categories
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "users manage own transactions" on public.transactions
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "users manage own budgets" on public.budgets
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "users manage own bills" on public.bills
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "users manage own goals" on public.savings_goals
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "users manage own contributions" on public.savings_contributions
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "users manage own activity" on public.activity_history
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Trigger helpers should never be directly callable through the Data API.
-- The security-definer signup trigger has an empty search path and is callable
-- only by Supabase Auth's database role.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.categories (user_id,name,color,is_default) values
    (new.id,'Food','#ef7d57',true),(new.id,'Transport','#4978d6',true),(new.id,'Shopping','#b573c5',true),
    (new.id,'Education','#1f9d84',true),(new.id,'Housing','#d39a36',true),(new.id,'Utilities','#7964ca',true),
    (new.id,'Healthcare','#d4546f',true),(new.id,'Entertainment','#42a8a0',true),(new.id,'Savings','#6b8d3e',true),(new.id,'Other','#7a8795',true);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.assert_category_owner() from public, anon, authenticated;
revoke execute on function public.assert_transaction_references() from public, anon, authenticated;
revoke execute on function public.assert_bill_payment_reference() from public, anon, authenticated;
revoke execute on function public.assert_contribution_goal_owner() from public, anon, authenticated;

-- Owner-scoped RPCs remain callable only by signed-in users.
revoke execute on function public.mark_bill_paid(uuid, date) from public, anon;
revoke execute on function public.undo_bill_payment(uuid) from public, anon;
revoke execute on function public.approve_budget_proposal(uuid, bigint, text) from public, anon;
grant execute on function public.mark_bill_paid(uuid, date) to authenticated;
grant execute on function public.undo_bill_payment(uuid) to authenticated;
grant execute on function public.approve_budget_proposal(uuid, bigint, text) to authenticated;

-- Existing composite indexes start with user_id and serve app queries. These
-- direct indexes cover foreign-key checks and cascades by parent record ID.
create index if not exists transactions_category_id_idx on public.transactions(category_id);
create index if not exists budgets_category_id_idx on public.budgets(category_id);
create index if not exists bills_category_id_idx on public.bills(category_id);
create index if not exists savings_goals_user_id_idx on public.savings_goals(user_id);
create index if not exists contributions_goal_id_idx on public.savings_contributions(goal_id);
