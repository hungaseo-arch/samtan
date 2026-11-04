// 로컬 검증용: PGlite(WASM Postgres)에 저장소 마이그레이션 전체를 순서대로 적용한다.
// prod 와 무관한 메모리 DB — Docker(supabase start)를 못 쓰는 환경의 대체 수단이다.
// 프로젝트 의존성에 넣지 않는다. 임시 폴더에서:
//   mkdir -p $TMPDIR/pg && cd $TMPDIR/pg && npm init -y && npm i @electric-sql/pglite
//   (pgTAP) curl -sL -o pgtap.zip https://api.pgxn.org/dist/pgtap/1.3.3/pgtap-1.3.3.zip → 풀어서
//          sed -e 's/__OS__/linux/g' -e 's/__VERSION__/1.3/g' sql/pgtap.sql.in > pgtap.sql
//   cp <repo>/scripts/local-pglite-check.mjs . && \
//   REPO=<repo> node local-pglite-check.mjs [<repo>/supabase/migrations/새파일.sql ...] [<repo>/supabase/tests/tNNN_test.sql]
// 추가 인자 파일은 전체 적용 뒤 한 번 더 실행된다 (멱등성 = 2회 적용 확인).
// 한계: Supabase auth·role 은 최소 스텁, 슈퍼유저 실행이라 RLS 검증(t103 #23 · t105)은 여기서 의미가 없다.
//       데이터 전제 가드(prod 건수)가 있는 20260827201000 은 건너뛰고 2026082722/23 은 notice 로 낮춘다.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

const REPO = process.env.REPO ?? process.cwd();
const MIG = path.join(REPO, "supabase/migrations");
const db = new PGlite();
const stub = `
create role anon; create role authenticated; create role service_role;
create role supabase_auth_admin; create role postgres_admin;
create schema if not exists auth;
create schema if not exists extensions;
create table auth.users (
  id uuid primary key default gen_random_uuid(), email text,
  raw_app_meta_data jsonb default '{}'::jsonb, raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(), last_sign_in_at timestamptz, updated_at timestamptz);
create table auth.audit_log_entries (instance_id uuid, id uuid, payload json, created_at timestamptz, ip_address text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
`;
await db.exec(stub);
const files = fs.readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort();
const extra = process.argv.slice(2);
const only = process.env.UNTIL;
let ok = 0;
for (const f of files) {
  if (only && f > only) break;
  if (f.startsWith("20260827201000")) { console.log(`SKIP(data-only backfill) ${f}`); continue; }
  let sql = fs.readFileSync(path.join(MIG, f), "utf8");
  // 데이터 건수 가드(prod 데이터 전제)는 로컬 빈 DB 에서 notice 로 낮춘다 — 스키마 검증 목적
  if (f.startsWith("20260827220000") || f.startsWith("20260827230000")) sql = sql.replace(/raise exception/g, "raise notice");
  try {
    await db.exec(sql);
    ok++;
  } catch (e) {
    console.log(`FAIL ${f}: ${e.message}`);
    if (!process.env.CONTINUE) process.exit(1);
  }
}
console.log(`applied ${ok}/${files.length}`);
if (extra.some((x) => x.endsWith("_test.sql"))) {
  await db.exec("set search_path = extensions, public;");
  await db.exec(fs.readFileSync(process.env.PGTAP_SQL ?? "pgtap.sql", "utf8"));
  await db.exec('set search_path = "$user", public, extensions;');
  console.log("pgtap loaded");
}
for (const x of extra) {
  let sql = fs.readFileSync(x, "utf8");
  sql = sql.replace(/create extension if not exists pgtap[^;]*;/i, "");
  try {
    const res = await db.exec(sql);
    for (const r of res) for (const row of r.rows ?? []) {
      const vals = Object.values(row);
      console.log(vals.length === 1 ? String(vals[0]) : JSON.stringify(row));
    }
    console.log(`OK extra ${x}`);
  } catch (e) {
    console.log(`FAIL extra ${x}: ${e.message}`);
    process.exit(1);
  }
}
