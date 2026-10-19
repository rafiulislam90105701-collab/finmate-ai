-- Enforce same-owner references in addition to row-level security. This closes
-- the gap where a caller could otherwise reference another account's opaque ID.
create or replace function public.assert_category_owner()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if not exists (
    select 1 from public.categories category_row
    where category_row.id = new.category_id and category_row.user_id = new.user_id
  ) then
    raise exception 'Category must belong to the same user';
  end if;
  return new;
end;
$$;

create or replace function public.assert_transaction_references()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if not exists (
    select 1 from public.categories category_row
    where category_row.id = new.category_id and category_row.user_id = new.user_id
  ) then
    raise exception 'Transaction category must belong to the same user';
  end if;
  if new.bill_id is not null and not exists (
    select 1 from public.bills bill_row
    where bill_row.id = new.bill_id and bill_row.user_id = new.user_id
  ) then
    raise exception 'Transaction bill must belong to the same user';
  end if;
  return new;
end;
$$;

create or replace function public.assert_bill_payment_reference()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.paid_transaction_id is not null and not exists (
    select 1 from public.transactions transaction_row
    where transaction_row.id = new.paid_transaction_id and transaction_row.user_id = new.user_id
  ) then
    raise exception 'Bill payment transaction must belong to the same user';
  end if;
  return new;
end;
$$;

create or replace function public.assert_contribution_goal_owner()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if not exists (
    select 1 from public.savings_goals goal_row
    where goal_row.id = new.goal_id and goal_row.user_id = new.user_id
  ) then
    raise exception 'Savings goal must belong to the same user';
  end if;
  return new;
end;
$$;

create trigger budgets_category_owner
before insert or update of user_id, category_id on public.budgets
for each row execute function public.assert_category_owner();

create trigger bills_category_owner
before insert or update of user_id, category_id on public.bills
for each row execute function public.assert_category_owner();

create trigger transactions_references_owner
before insert or update of user_id, category_id, bill_id on public.transactions
for each row execute function public.assert_transaction_references();

create trigger bills_paid_transaction_owner
before insert or update of user_id, paid_transaction_id on public.bills
for each row execute function public.assert_bill_payment_reference();

create trigger contributions_goal_owner
before insert or update of user_id, goal_id on public.savings_contributions
for each row execute function public.assert_contribution_goal_owner();
