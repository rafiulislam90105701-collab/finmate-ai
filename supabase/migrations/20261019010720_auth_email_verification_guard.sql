-- Restrict authenticated financial-data access until the caller has confirmed
-- their email. This does not change or delete existing rows.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.current_user_email_confirmed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select u.email_confirmed_at is not null
       from auth.users as u
      where u.id = (select auth.uid())),
    false
  ) and (select auth.uid()) is not null;
$$;

revoke all on function private.current_user_email_confirmed() from public, anon;
grant execute on function private.current_user_email_confirmed() to authenticated;

alter policy "users manage own profile" on public.profiles
  using (auth.uid() = id and (select private.current_user_email_confirmed()))
  with check (auth.uid() = id and (select private.current_user_email_confirmed()));
alter policy "users manage own categories" on public.categories
  using (auth.uid() = user_id and (select private.current_user_email_confirmed()))
  with check (auth.uid() = user_id and (select private.current_user_email_confirmed()));
alter policy "users manage own transactions" on public.transactions
  using (auth.uid() = user_id and (select private.current_user_email_confirmed()))
  with check (auth.uid() = user_id and (select private.current_user_email_confirmed()));
alter policy "users manage own budgets" on public.budgets
  using (auth.uid() = user_id and (select private.current_user_email_confirmed()))
  with check (auth.uid() = user_id and (select private.current_user_email_confirmed()));
alter policy "users manage own bills" on public.bills
  using (auth.uid() = user_id and (select private.current_user_email_confirmed()))
  with check (auth.uid() = user_id and (select private.current_user_email_confirmed()));
alter policy "users manage own goals" on public.savings_goals
  using (auth.uid() = user_id and (select private.current_user_email_confirmed()))
  with check (auth.uid() = user_id and (select private.current_user_email_confirmed()));
alter policy "users manage own contributions" on public.savings_contributions
  using (auth.uid() = user_id and (select private.current_user_email_confirmed()))
  with check (auth.uid() = user_id and (select private.current_user_email_confirmed()));
alter policy "users manage own activity" on public.activity_history
  using (auth.uid() = user_id and (select private.current_user_email_confirmed()))
  with check (auth.uid() = user_id and (select private.current_user_email_confirmed()));
