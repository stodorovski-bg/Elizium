-- ============================================================================
--  Elizium – Дарителска кампания за ремонт на футболното игрище
--  Схема за база данни в Supabase (Postgres)
--
--  Как да я приложите:
--    1. Влезте в проекта си в https://supabase.com
--    2. Отворете "SQL Editor" -> "New query"
--    3. Копирайте целия този файл и натиснете "Run"
--
--  Дизайнът пази поверителността: анонимните записи НЕ са достъпни през
--  публичния (anon) ключ. Достъпът минава само през функциите по-долу,
--  които връщат единствено обобщени числа и НЕанонимните участници.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Таблица със записванията
-- ---------------------------------------------------------------------------
create table if not exists public.pledges (
  id              uuid primary key default gen_random_uuid(),
  block           text        not null,
  entrance        text        not null,
  apartment       text        not null,
  name            text,
  amount          numeric(10,2) not null check (amount > 0),
  is_anonymous    boolean     not null default false,
  payment_method  text        check (payment_method in ('revolut', 'cash')),
  created_at      timestamptz not null default now(),
  -- Един апартамент = едно записване. Проверката е нечувствителна към
  -- главни/малки букви и водещи/крайни интервали.
  constraint pledges_unique_apartment
    unique (block, entrance, apartment)
);

-- Индекс за бърза проверка за дублиран апартамент
create index if not exists pledges_apartment_lookup
  on public.pledges (lower(block), lower(entrance), lower(apartment));

-- ---------------------------------------------------------------------------
-- 2. Row Level Security – затваряме директния достъп до таблицата.
--    Публичният ключ НЕ може да чете/пише директно; всичко минава през
--    функциите (SECURITY DEFINER) по-долу.
-- ---------------------------------------------------------------------------
alter table public.pledges enable row level security;
-- Нарочно НЕ създаваме политики за anon => никакъв директен достъп.

-- ---------------------------------------------------------------------------
-- 3. Функция за записване (с проверка за дублиран апартамент)
--    Връща JSON: {status: 'ok' | 'duplicate' | 'error', message?: text}
-- ---------------------------------------------------------------------------
create or replace function public.register_pledge(
  p_block          text,
  p_entrance       text,
  p_apartment      text,
  p_name           text,
  p_amount         numeric,
  p_is_anonymous   boolean,
  p_payment_method text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_block     text := trim(coalesce(p_block, ''));
  v_entrance  text := trim(coalesce(p_entrance, ''));
  v_apartment text := trim(coalesce(p_apartment, ''));
  v_name      text := nullif(trim(coalesce(p_name, '')), '');
  v_method    text := lower(trim(coalesce(p_payment_method, '')));
  v_exists    boolean;
begin
  -- Валидация на задължителните полета
  if v_block = '' or v_entrance = '' or v_apartment = '' then
    return json_build_object('status', 'error',
      'message', 'Моля, попълнете блок, вход и апартамент.');
  end if;

  if p_amount is null or p_amount <= 0 then
    return json_build_object('status', 'error',
      'message', 'Моля, въведете валидна сума.');
  end if;

  -- Нормализираме начина на плащане
  if v_method not in ('revolut', 'cash') then
    v_method := null;
  end if;

  -- Проверка дали апартаментът вече е записан
  select exists (
    select 1 from public.pledges
    where lower(block)     = lower(v_block)
      and lower(entrance)  = lower(v_entrance)
      and lower(apartment) = lower(v_apartment)
  ) into v_exists;

  if v_exists then
    return json_build_object('status', 'duplicate',
      'message', 'Този апартамент вече е регистриран в кампанията.');
  end if;

  insert into public.pledges
    (block, entrance, apartment, name, amount, is_anonymous, payment_method)
  values
    (v_block, v_entrance, v_apartment, v_name, p_amount, coalesce(p_is_anonymous, false), v_method);

  return json_build_object('status', 'ok');

exception
  -- Ако двама натиснат "Изпрати" едновременно за един апартамент
  when unique_violation then
    return json_build_object('status', 'duplicate',
      'message', 'Този апартамент вече е регистриран в кампанията.');
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Обобщена статистика (публична, без лични данни)
--    Връща JSON: {total_amount, participant_count}
-- ---------------------------------------------------------------------------
create or replace function public.get_campaign_stats()
returns json
language sql
security definer
set search_path = public
stable
as $$
  select json_build_object(
    'total_amount',      coalesce(sum(amount), 0),
    'participant_count', count(*)
  )
  from public.pledges;
$$;

-- ---------------------------------------------------------------------------
-- 5. Списък на НЕанонимните участници (публичен)
--    Не връща блок/вход/апартамент – само име и сума.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_pledges()
returns table (
  name       text,
  amount     numeric,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce(nullif(trim(name), ''), 'Съсед') as name,
    amount,
    created_at
  from public.pledges
  where is_anonymous = false
  order by created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- 6. Права за изпълнение на функциите от публичния (anon) ключ
-- ---------------------------------------------------------------------------
grant execute on function public.register_pledge(text, text, text, text, numeric, boolean, text) to anon, authenticated;
grant execute on function public.get_campaign_stats() to anon, authenticated;
grant execute on function public.get_public_pledges() to anon, authenticated;
