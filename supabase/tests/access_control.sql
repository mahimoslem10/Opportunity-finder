/*
Access control tests for the owner-scoped private tables.

Run with the database's SQL runner. The script impersonates the two real accounts
(earliest and second-earliest in auth.users) and anonymous visitors, checks the rules,
and ends with an exception so every test row is rolled back. A passing run ends with
the message "ACCESS CONTROL TESTS PASSED". Any failed check stops the run with "FAIL: ...".
*/

DO $$
DECLARE
  user_a uuid;
  user_b uuid;
  new_id uuid;
  owner_seen uuid;
  n int;
BEGIN
  SELECT id INTO user_a FROM auth.users ORDER BY created_at LIMIT 1;
  SELECT id INTO user_b FROM auth.users ORDER BY created_at OFFSET 1 LIMIT 1;
  IF user_a IS NULL OR user_b IS NULL THEN
    RAISE EXCEPTION 'FAIL: setup needs two accounts in auth.users';
  END IF;

  -- 1. Anonymous visitors cannot read or write private tables
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM 1 FROM public.sources;
    RAISE EXCEPTION 'FAIL: anon could read sources';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.profile;
    RAISE EXCEPTION 'FAIL: anon could read profile';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.sources (name, url) VALUES ('anon test', 'https://anon.test');
    RAISE EXCEPTION 'FAIL: anon could insert into sources';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- 2. Account A creates a row and it is stamped with A
  PERFORM set_config('request.jwt.claims', json_build_object('sub', user_a, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.sources (name, url) VALUES ('owner test A', 'https://a.test')
  RETURNING id, user_id INTO new_id, owner_seen;
  IF owner_seen IS DISTINCT FROM user_a THEN
    RAISE EXCEPTION 'FAIL: new row was not stamped with its owner';
  END IF;
  SELECT count(*) INTO n FROM public.sources WHERE id = new_id;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: owner cannot see own row'; END IF;
  -- Owner sees only rows it owns; unowned rows are never visible to any account
  SELECT count(*) INTO n FROM public.sources WHERE user_id IS DISTINCT FROM user_a;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: owner can see rows it does not own'; END IF;
  RESET ROLE;

  -- 3. Account B cannot see, change or delete A's row
  PERFORM set_config('request.jwt.claims', json_build_object('sub', user_b, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', user_b::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.sources;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: other account can read private rows'; END IF;
  SELECT count(*) INTO n FROM public.sources WHERE id = new_id;
  UPDATE public.sources SET name = 'hijacked' WHERE id = new_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: other account updated a private row'; END IF;
  DELETE FROM public.sources WHERE id = new_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: other account deleted a private row'; END IF;

  -- 4. Account B cannot insert a row owned by A
  BEGIN
    INSERT INTO public.sources (name, url, user_id) VALUES ('forged', 'https://b.test', user_a);
    RAISE EXCEPTION 'FAIL: account B inserted a row owned by account A';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- 5. Account B can still create and see its own rows
  INSERT INTO public.opportunities (title) VALUES ('owner test B') RETURNING user_id INTO owner_seen;
  IF owner_seen IS DISTINCT FROM user_b THEN
    RAISE EXCEPTION 'FAIL: account B row not stamped with B';
  END IF;
  RESET ROLE;

  -- 6. A still has its row after B's attempts
  PERFORM set_config('request.jwt.claims', json_build_object('sub', user_a, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.sources WHERE id = new_id;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: owner row changed after other account attempts'; END IF;
  RESET ROLE;

  RAISE EXCEPTION 'ACCESS CONTROL TESTS PASSED: all checks succeeded (test rows rolled back)';
END $$;
