/**
 * ModelArena.tsx — AI Advisor "Model arena": seven models predict the same assets on the same days
 * (src/ai/arena.ts) and are ranked by their out-of-sample Brier skill against the base-rate model;
 * then the live round (each model's daily prediction saved by the server and scored when due) and,
 * for one chosen asset, what every model says today. A statistical comparison, not advice.
 */
import { useEffect, useMemo, useState } from 'react';
import { Swords, Trophy } from 'lucide-react';
import { ARENA_MIN_SIGNALS, arenaLeaderboard, type ArenaLiveBoard, type ArenaModelId } from '../ai/arena.ts';
import type { AssetOutlook } from '../ai/outlook.ts';
import { assetName } from '../i18n/assetNames.ts';
import { useT, type TranslationKey } from '../i18n/index.ts';
import { Rich } from '../i18n/Rich.tsx';
import { getAssetBySymbol } from '../config/assets.ts';
import { formatDecimal } from '../utils/format.ts';

const pct = (v: number | null | undefined, digits = 0) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${formatDecimal(v * 100, digits)}%`);
const signed = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${formatDecimal(v * 100, 1)}%`;
const skillColor = (v: number | null | undefined) => (v === null || v === undefined ? undefined : v > 0.005 ? 'var(--color-up)' : v < -0.005 ? 'var(--color-down)' : undefined);

async function fetchArenaLive(horizon: number): Promise<{ board: ArenaLiveBoard; scheduleWib: string }> {
  const res = await fetch(`/api/ai/arena-live?horizon=${horizon}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function ModelArena({ assets, horizonDays }: { assets: AssetOutlook[]; horizonDays: number }) {
  const t = useT();
  const withArena = useMemo(() => assets.filter((a) => a.arena), [assets]);
  const board = useMemo(() => arenaLeaderboard(withArena), [withArena]);
  const [symbol, setSymbol] = useState<string>('');
  const [live, setLive] = useState<ArenaLiveBoard | null>(null);
  const [liveError, setLiveError] = useState(false);

  useEffect(() => {
    let alive = true;
    setLive(null);
    fetchArenaLive(horizonDays)
      .then((d) => alive && (setLive(d.board), setLiveError(false)))
      .catch(() => alive && setLiveError(true));
    return () => {
      alive = false;
    };
  }, [horizonDays]);

  if (withArena.length === 0) return null;
  const name = (id: ArenaModelId) => t(`arena.model.${id}` as TranslationKey);
  const leader = board.find((r) => r.id !== 'baseRate' && (r.brierSkill ?? 0) > 0) ?? null;
  const picked = withArena.find((a) => a.symbol === symbol) ?? withArena[0];
  const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };
  const th = 'px-2 py-2 font-semibold text-right whitespace-nowrap';
  const td = 'px-2 py-2 text-right font-mono-num whitespace-nowrap';

  return (
    <section aria-labelledby="arena-heading" className="p-5 md:p-6 rounded-xl border space-y-4" style={card}>
      <div className="flex items-start gap-2.5">
        <Swords className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--accent-radar)' }} />
        <div className="min-w-0">
          <h2 id="arena-heading" className="text-base font-bold">
            {t('arena.title')}
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            <Rich text={t('arena.intro', { n: withArena.length, h: horizonDays })} />
          </p>
        </div>
      </div>

      {leader ? (
        <p className="text-sm flex items-start gap-2 p-3 rounded-lg" style={{ backgroundColor: 'var(--accent-radar-soft)' }}>
          <Trophy className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--color-gold)' }} />
          <span>
            <Rich text={t('arena.leader', { model: name(leader.id), skill: signed(leader.brierSkill), beats: leader.beatsBase, n: leader.assets, wins: leader.wins })} />
          </span>
        </p>
      ) : (
        <p className="text-sm p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-surface-subtle)' }}>
          {t('arena.noLeader')}
        </p>
      )}

      {/* Back-test leaderboard (out-of-sample, same days for every model) */}
      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border-subtle)' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-surface-subtle)' }}>
              <th className="px-2 py-2 font-semibold text-left">#</th>
              <th className="px-2 py-2 font-semibold text-left">{t('arena.col.model')}</th>
              <th className={th} title={t('arena.col.skillHint')}>{t('arena.col.skill')}</th>
              <th className={th}>{t('arena.col.accuracy')}</th>
              <th className={th} title={t('arena.col.hitHint', { min: ARENA_MIN_SIGNALS })}>{t('arena.col.hit')}</th>
              <th className={`${th} hidden sm:table-cell`}>{t('arena.col.signals')}</th>
              <th className={th}>{t('arena.col.wins')}</th>
              <th className={`${th} hidden md:table-cell`}>{t('arena.col.beats')}</th>
            </tr>
          </thead>
          <tbody>
            {board.map((r, i) => (
              <tr key={r.id} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <td className="px-2 py-2 font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                  {i + 1}
                </td>
                <td className="px-2 py-2">
                  <span className="font-semibold block">{name(r.id)}</span>
                  <span className="text-[10px] block" style={{ color: 'var(--text-secondary)' }}>
                    {t(`arena.desc.${r.id}` as TranslationKey)}
                  </span>
                </td>
                <td className={td} style={{ color: skillColor(r.brierSkill) }}>
                  {r.id === 'baseRate' ? '0' : signed(r.brierSkill)}
                </td>
                <td className={td}>{pct(r.accuracy)}</td>
                <td className={td}>
                  {pct(r.hitRate)}
                  <span className="block text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    {t('arena.vsBase', { base: pct(r.baseRate) })}
                  </span>
                </td>
                <td className={`${td} hidden sm:table-cell`}>{r.signals}</td>
                <td className={td}>{r.wins}</td>
                <td className={`${td} hidden md:table-cell`}>
                  {r.id === 'baseRate' ? '—' : `${r.beatsBase}/${r.assets}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        <Rich text={t('arena.howRead')} />
      </p>

      {/* Live round: recorded daily, scored when due */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold">{t('arena.live.title')}</h3>
        {liveError ? (
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {t('common.dataUnavailable')}
          </p>
        ) : !live ? (
          <div className="h-10 rounded animate-pulse" style={{ backgroundColor: 'var(--bg-surface-subtle)' }} aria-busy="true" />
        ) : live.evaluated === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {live.saved
              ? t('arena.live.waiting', { saved: live.saved, first: live.firstDate ?? '—', h: horizonDays })
              : t('arena.live.empty')}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border-subtle)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-surface-subtle)' }}>
                  <th className="px-2 py-2 font-semibold text-left">{t('arena.col.model')}</th>
                  <th className={th}>{t('arena.col.brier')}</th>
                  <th className={th}>{t('arena.col.accuracy')}</th>
                  <th className={th}>{t('arena.col.hit')}</th>
                  <th className={th}>{t('arena.col.evaluated')}</th>
                </tr>
              </thead>
              <tbody>
                {live.rows.map((r) => (
                  <tr key={r.id} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                    <td className="px-2 py-2 font-semibold">{name(r.id)}</td>
                    <td className={td}>{r.brier === null ? '—' : formatDecimal(r.brier, 3)}</td>
                    <td className={td}>{pct(r.accuracy)}</td>
                    <td className={td}>{pct(r.hitRate)}</td>
                    <td className={td}>{r.evaluated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-2 py-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              {t('arena.live.note', { n: live.evaluated, base: pct(live.baseUpRate) })}
            </p>
          </div>
        )}
      </div>

      {/* One asset: what every model says today */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold">{t('arena.asset.title')}</h3>
          <select
            value={picked.symbol}
            onChange={(e) => setSymbol(e.target.value)}
            aria-label={t('arena.asset.pick')}
            className="text-xs rounded-lg border px-2 py-1"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
          >
            {withArena.map((a) => {
              const cfg = getAssetBySymbol(a.symbol);
              return (
                <option key={a.symbol} value={a.symbol}>
                  {a.code} · {cfg ? assetName(cfg) : a.name}
                </option>
              );
            })}
          </select>
        </div>
        {picked.arena && (
          <>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {t('arena.asset.votes', { up: picked.arena.votes.up, down: picked.arena.votes.down, none: picked.arena.votes.none, best: picked.arena.best ? name(picked.arena.best) : '—' })}
            </p>
            <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border-subtle)' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-surface-subtle)' }}>
                    <th className="px-2 py-2 font-semibold text-left">{t('arena.col.model')}</th>
                    <th className={th}>{t('arena.col.pNow')}</th>
                    <th className={th}>{t('arena.col.now')}</th>
                    <th className={th}>{t('arena.col.skill')}</th>
                    <th className={`${th} hidden sm:table-cell`}>{t('arena.col.hit')}</th>
                  </tr>
                </thead>
                <tbody>
                  {picked.arena.models.map((m) => (
                    <tr
                      key={m.id}
                      className="border-t"
                      style={{ borderColor: 'var(--border-subtle)', backgroundColor: m.id === picked.arena?.best ? 'var(--accent-radar-soft)' : undefined }}
                    >
                      <td className="px-2 py-2 font-semibold">{name(m.id)}</td>
                      <td className={td}>{pct(m.pNow)}</td>
                      <td className={td} style={{ color: m.signalNow === 'up' ? 'var(--color-up)' : m.signalNow === 'down' ? 'var(--color-down)' : undefined }}>
                        {t(`arena.signal.${m.signalNow}` as TranslationKey)}
                      </td>
                      <td className={td} style={{ color: skillColor(m.brierSkill) }}>
                        {m.id === 'baseRate' ? '0' : signed(m.brierSkill)}
                      </td>
                      <td className={`${td} hidden sm:table-cell`}>{m.edge === null ? '—' : `${pct(m.oos?.signalHitRate)} (${signed(m.edge)})`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        <Rich text={t('adv.disclaimer')} />
      </p>
    </section>
  );
}
