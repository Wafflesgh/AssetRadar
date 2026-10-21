-- cron.sql — Schedules AssetRadar's background work on a serverless host (Vercel): every 10
-- minutes the database calls POST <app>/api/cron/tick (server alerts, due daily jobs and one step
-- of the long market scans). Uses Supabase's pg_cron + pg_net; the app address and the cron token
-- are kept encrypted in Supabase Vault, not in the job text.
--
-- How to use (once, after the app is live on Vercel):
--   1. Replace the two PASTE-… values below (the token is the same CRON_TOKEN as in Vercel).
--   2. Supabase → SQL Editor → paste this whole file → Run.
-- Check:  select * from cron.job_run_details order by start_time desc limit 5;
--         select status_code, created from net._http_response order by created desc limit 5;
-- Stop:   select cron.unschedule('assetradar-tick');
-- Change: run the whole file again with the new values, or: select vault.update_secret((select id from vault.secrets where name = 'assetradar_app_url'), 'https://new-address');

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Safe to run again: earlier secrets and the earlier job are replaced
delete from vault.secrets where name in ('assetradar_app_url', 'assetradar_cron_token');
select cron.unschedule(jobid) from cron.job where jobname = 'assetradar-tick';

select vault.create_secret('https://PASTE-YOUR-APP.vercel.app', 'assetradar_app_url', 'AssetRadar address for the tick');
select vault.create_secret('PASTE-CRON-TOKEN-HERE', 'assetradar_cron_token', 'AssetRadar CRON_TOKEN');

select cron.schedule(
  'assetradar-tick',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'assetradar_app_url') || '/api/cron/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'assetradar_cron_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $$
);
