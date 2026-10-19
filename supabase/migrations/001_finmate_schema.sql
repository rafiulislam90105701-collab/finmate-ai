-- FinMate AI: user-owned finance data. Apply with `supabase db push`.
-- Amounts are integer minor units (for BDT, paisa) to avoid floating point errors.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  currency text not null default 'BDT' check (currency in ('BDT','USD','EUR','GBP','INR')),
  timezone text not null default 'Asia/Dhaka',
  opening_balance_minor bigint not null default 0 check (opening_balance_minor >= 0),
  expected_remaining_minor bigint check (expected_remaining_minor is null or expected_remaining_minor >= 0),
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 50),
  color text not null default '#4978d6' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  month date not null check (date_trunc('month', month)::date = month),
  amount_minor bigint not null check (amount_minor >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, month)
);

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  amount_minor bigint not null check (amount_minor > 0),
  due_date date not null,
  category_id uuid not null references public.categories(id) on delete restrict,
  recurring text not null default 'none' check (recurring in ('none','weekly','monthly','yearly')),
  paid_at timestamptz,
  paid_transaction_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  type text not null check (type in ('income','expense')),
  description text not null check (char_length(trim(description)) between 1 and 120),
  category_id uuid not null references public.categories(id) on delete restrict,
  transaction_date date not null,
  account text check (account is null or char_length(account) <= 80),
  notes text check (notes is null or char_length(notes) <= 500),
  recurring text not null default 'none' check (recurring in ('none','weekly','monthly','yearly')),
  bill_id uuid unique references public.bills(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.bills add constraint bills_paid_transaction_id_fkey foreign key (paid_transaction_id) references public.transactions(id) on delete set null;

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  target_minor bigint not null check (target_minor > 0),
  saved_minor bigint not null default 0 check (saved_minor >= 0),
  target_date date,
  color text not null default '#4978d6' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.savings_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references public.savings_goals(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  contribution_date date not null default current_date,
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now()
);

create table public.activity_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (char_length(action) between 1 and 120),
  detail text not null check (char_length(detail) <= 500),
  created_at timestamptz not null default now()
);

create index transactions_user_date_idx on public.transactions(user_id, transaction_date desc);
create unique index categories_user_name_unique on public.categories(user_id, lower(name));
create index transactions_user_category_date_idx on public.transactions(user_id, category_id, transaction_date desc);
create index bills_user_due_idx on public.bills(user_id, due_date) where paid_at is null;
create index budgets_user_month_idx on public.budgets(user_id, month);
create index contributions_user_goal_idx on public.savings_contributions(user_id, goal_id, contribution_date desc);
create index activity_user_created_idx on public.activity_history(user_id, created_at desc);

create or replace function public.set_updated_at() returns trigger language plpgsql security invoker set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger categories_updated before update on public.categories for each row execute function public.set_updated_at();
create trigger budgets_updated before update on public.budgets for each row execute function public.set_updated_at();
create trigger bills_updated before update on public.bills for each row execute function public.set_updated_at();
create trigger transactions_updated before update on public.transactions for each row execute function public.set_updated_at();
create trigger savings_goals_updated before update on public.savings_goals for each row execute function public.set_updated_at();

-- Creates a private profile and sensible categories when an auth user is created.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.categories (user_id,name,color,is_default) values
    (new.id,'Food','#ef7d57',true),(new.id,'Transport','#4978d6',true),(new.id,'Shopping','#b573c5',true),
    (new.id,'Education','#1f9d84',true),(new.id,'Housing','#d39a36',true),(new.id,'Utilities','#7964ca',true),
    (new.id,'Healthcare','#d4546f',true),(new.id,'Entertainment','#42a8a0',true),(new.id,'Savings','#6b8d3e',true),(new.id,'Other','#7a8795',true);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.bills enable row level security;
alter table public.savings_goals enable row level security;
alter table public.savings_contributions enable row level security;
alter table public.activity_history enable row level security;

create policy "users manage own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "users manage own categories" on public.categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own transactions" on public.transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own budgets" on public.budgets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own bills" on public.bills for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own goals" on public.savings_goals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own contributions" on public.savings_contributions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own activity" on public.activity_history for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Atomic, idempotent bill payment. Creates one linked expense and one audit entry.
create or replace function public.mark_bill_paid(p_bill_id uuid, p_paid_date date default current_date)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_bill public.bills; v_transaction_id uuid;
begin
  select * into v_bill from public.bills where id = p_bill_id and user_id = auth.uid() for update;
  if not found then raise exception 'Bill not found'; end if;
  if v_bill.paid_transaction_id is not null then return v_bill.paid_transaction_id; end if;
  insert into public.transactions (user_id,amount_minor,type,description,category_id,transaction_date,recurring,bill_id)
    values (auth.uid(),v_bill.amount_minor,'expense','Bill: ' || v_bill.name,v_bill.category_id,p_paid_date,v_bill.recurring,v_bill.id)
    returning id into v_transaction_id;
  update public.bills set paid_at = now(), paid_transaction_id = v_transaction_id where id = v_bill.id;
  insert into public.activity_history (user_id,action,detail) values (auth.uid(),'Bill marked paid',v_bill.name || ' added once to the transaction ledger.');
  return v_transaction_id;
end;
$$;

-- Reverse a bill payment as one authorized operation. The linked transaction is
-- removed only when it belongs to the current user, so a caller cannot unlink
-- or delete another account's ledger row.
create or replace function public.undo_bill_payment(p_bill_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare v_bill public.bills; v_transaction_id uuid;
begin
  select * into v_bill from public.bills where id = p_bill_id and user_id = auth.uid() for update;
  if not found then raise exception 'Bill not found'; end if;
  if v_bill.paid_transaction_id is null then return; end if;
  v_transaction_id := v_bill.paid_transaction_id;
  update public.bills set paid_at = null, paid_transaction_id = null where id = v_bill.id;
  delete from public.transactions where id = v_transaction_id and user_id = auth.uid();
  insert into public.activity_history (user_id,action,detail) values (auth.uid(),'Bill payment undone',v_bill.name || ' is again reserved as unpaid.');
end;
$$;

-- A controlled assistant proposal still needs explicit client-side confirmation before this RPC is called.
create or replace function public.approve_budget_proposal(p_budget_id uuid, p_proposed_minor bigint, p_reason text default 'Assistant proposal approved')
returns public.budgets language plpgsql security invoker set search_path = public as $$
declare updated_budget public.budgets;
begin
  if p_proposed_minor < 0 then raise exception 'Budget must not be negative'; end if;
  update public.budgets set amount_minor = p_proposed_minor where id = p_budget_id and user_id = auth.uid() returning * into updated_budget;
  if not found then raise exception 'Budget not found'; end if;
  insert into public.activity_history (user_id,action,detail) values (auth.uid(),'AI budget proposal approved',left(p_reason,500));
  return updated_budget;
end;
$$;

-- Cross-user RLS smoke check (run as two authenticated test users):
-- select * from public.transactions;  -- must return only the caller's rows
