-- Review 2026-10-17 §4 (block A2): a job that used up its attempts is dead, not merely undone.
-- It leaves the due index, is counted on /metrics (caime_jobs_dead), is listed to the operator
-- with its last error and can be retried by hand; retention lets it go after KEPT_DAYS.doneJobs,
-- as a done job. `locked_at` doubles as a heartbeat now (a long job renews it), so a lock older
-- than the stale limit means a worker died, not a job that is still going.
alter table jobs add column dead_at timestamptz;
create index jobs_dead on jobs (dead_at) where dead_at is not null;
-- What is due, less the dead: the claim's own index. `jobs_ready` (0001) stays for the release
-- that still queries without `dead_at`; a later migration drops it.
create index jobs_due on jobs (run_at) where done_at is null and dead_at is null;

-- A periodic task runs once across every instance (review §4: billing's reconcile and the
-- calendar sweep ran on each worker). A run claims its row first; a claim older than the task's
-- own interval is a worker that died mid-run and is taken over.
create table periodic_runs (
  name text primary key,
  started_at timestamptz not null,
  finished_at timestamptz,
  instance text not null
);
