-- Preserve the one-to-one relationship between a paid bill and the ledger
-- expense created by mark_bill_paid(). Client UI prevents these changes too,
-- but the database remains the authority for every authenticated client.

create or replace function public.prevent_paid_bill_schedule_change()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.paid_transaction_id is not null
    and row(new.name, new.amount_minor, new.due_date, new.category_id, new.recurring)
      is distinct from row(old.name, old.amount_minor, old.due_date, old.category_id, old.recurring) then
    raise exception 'Undo the bill payment before changing its schedule or amount';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_linked_bill_transaction_change()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if exists (select 1 from public.bills where paid_transaction_id = old.id) then
    if tg_op = 'DELETE' then
      raise exception 'Undo the bill payment before deleting its ledger transaction';
    end if;
    if row(new.amount_minor, new.type, new.description, new.category_id, new.transaction_date, new.account, new.notes, new.recurring, new.bill_id)
      is distinct from row(old.amount_minor, old.type, old.description, old.category_id, old.transaction_date, old.account, old.notes, old.recurring, old.bill_id) then
      raise exception 'Undo the bill payment before changing its ledger transaction';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger bills_prevent_paid_schedule_change
before update on public.bills
for each row execute function public.prevent_paid_bill_schedule_change();

create trigger transactions_prevent_linked_bill_change
before update or delete on public.transactions
for each row execute function public.prevent_linked_bill_transaction_change();

revoke execute on function public.prevent_paid_bill_schedule_change() from public, anon, authenticated;
revoke execute on function public.prevent_linked_bill_transaction_change() from public, anon, authenticated;
