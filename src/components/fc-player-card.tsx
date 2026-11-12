"use client";

/**
 * v4.9 — EA Sports FC-style player card.
 *
 * Sits under the six face stats in the player detail sheet:
 *   · 29 derived in-game stats grouped by face stat (PAC/SHO/PAS/DRI/DEF/PHY)
 *   · Profile attributes: Skill Moves, Weak Foot, Preferred Foot, Body Type,
 *     AcceleRATE
 *   · Player Roles with + / ++ mastery
 *   · PlayStyles & PlayStyles+
 *
 * Everything is derived deterministically from (id, position, face stats) —
 * see lib/game/fc.ts. No save migration needed.
 */
import { useMemo } from "react";
import { buildFcProfile, FC_GROUPS } from "@/lib/game/fc";
import { computePlayStyles } from "@/lib/game/development";
import { isGKAttributes } from "@/lib/game/attributes";
import type { PlayerState } from "@/lib/game/types";
import { cn } from "@/lib/utils";

function statTone(v: number): string {
  if (v >= 85) return "bg-emerald-400";
  if (v >= 75) return "bg-emerald-400/70";
  if (v >= 65) return "bg-amber-400";
  if (v >= 55) return "bg-orange-400";
  return "bg-rose-400";
}

function faceTone(v: number): string {
  return v >= 80 ? "text-emerald-400" : v >= 65 ? "text-amber-400" : "text-rose-400";
}

function MiniBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5" title={label}>
      <span className="w-[52px] shrink-0 truncate text-[8px] font-semibold text-slate-500">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
        <div className={cn("h-full rounded-full", statTone(value))} style={{ width: `${value}%` }} />
      </div>
      <span className="w-5 shrink-0 text-right text-[9px] font-bold text-slate-300 tabular-nums">{value}</span>
    </div>
  );
}

function Stars({ n, max = 5 }: { n: number; max?: number }) {
  return (
    <span className="tracking-tight" aria-label={`${n} out of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < n ? "text-amber-300" : "text-slate-700"} aria-hidden>
          ★
        </span>
      ))}
    </span>
  );
}

function ProfileChip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-1.5">
      <p className="text-[8px] font-bold uppercase tracking-wider text-slate-600">{label}</p>
      <p className="text-[11px] font-bold text-slate-200">{children}</p>
    </div>
  );
}

export function FcPlayerCard({ player }: { player: PlayerState }) {
  const profile = useMemo(() => buildFcProfile(player), [player]);
  const styles = useMemo(() => computePlayStyles(player), [player]);
  const isGK = isGKAttributes(player.attributes);
  const accTone =
    profile.acceleRATE === "Explosive"
      ? "text-emerald-300"
      : profile.acceleRATE === "Lengthy"
        ? "text-sky-300"
        : "text-slate-200";

  return (
    <div className="space-y-3">
      {/* ---- profile attributes ---- */}
      <section aria-label="Player profile attributes" className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Player profile</p>
        <div className="grid grid-cols-3 gap-1.5">
          {!isGK && (
            <>
              <ProfileChip label="Skill Moves">
                <Stars n={profile.skillMoves} />
              </ProfileChip>
              <ProfileChip label="Weak Foot">
                <Stars n={profile.weakFoot} />
              </ProfileChip>
            </>
          )}
          <ProfileChip label="Preferred Foot">
            <span className={profile.preferredFoot === "Left" ? "text-amber-300" : "text-slate-200"}>
              {profile.preferredFoot}
            </span>
          </ProfileChip>
          <ProfileChip label="AcceleRATE">
            <span className={accTone}>{profile.acceleRATE}</span>
          </ProfileChip>
          <ProfileChip label="Body Type">{profile.bodyType}</ProfileChip>
          <ProfileChip label="PlayStyles">
            <span className={styles.some((s) => s.plus) ? "text-amber-300" : styles.length ? "text-emerald-300" : "text-slate-500"}>
              {styles.length ? `${styles.length}${styles.some((s) => s.plus) ? " (+)" : ""}` : "—"}
            </span>
          </ProfileChip>
        </div>
      </section>

      {/* ---- player roles ---- */}
      {profile.roles.length > 0 && (
        <section aria-label="Player roles" className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Player roles <span className="normal-case text-slate-600">(+ proficient · ++ elite)</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {profile.roles.map((r) => (
              <span
                key={r.id}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[10px] font-bold",
                  r.level === "++"
                    ? "border-amber-400/60 bg-amber-400/10 text-amber-300"
                    : r.level === "+"
                      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                      : "border-slate-700 bg-slate-950/60 text-slate-400",
                )}
              >
                {r.name}
                {r.level === "++" ? " ++" : r.level === "+" ? " +" : ""}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ---- in-game stats (outfield only — the keeper set is already specific) ---- */}
      {!isGK && profile.stats && (
        <section aria-label="In-game stats" className="space-y-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            In-game stats <span className="normal-case text-slate-600">· 29 specifics behind the face stats</span>
          </p>
          {FC_GROUPS.map((group) => {
            const face = player.attributes[group.face];
            return (
              <div key={group.code} className="rounded-lg border border-slate-800 bg-slate-950/40 p-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {group.label}
                  </span>
                  <span className={cn("font-mono text-xs font-black tabular-nums", faceTone(face))}>
                    {group.code} <span className="text-slate-200">{face}</span>
                  </span>
                </div>
                <div className="space-y-1">
                  {group.attrs.map((a) => (
                    <MiniBar key={a.key} label={a.label} value={profile.stats![a.key]} />
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* ---- playstyles ---- */}
      {styles.length > 0 && (
        <section aria-label="PlayStyles" className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            PlayStyles <span className="normal-case text-slate-600">(gold = PlayStyle+)</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {styles.map((s) => (
              <span
                key={s.id}
                title={s.plus ? `${s.name}+ — elite version` : s.name}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[10px] font-bold",
                  s.plus
                    ? "border-amber-400/70 bg-amber-400/15 text-amber-200"
                    : "border-emerald-500/50 bg-emerald-500/10 text-emerald-300",
                )}
              >
                {s.name}{s.plus ? "+" : ""}
              </span>
            ))}
          </div>
        </section>
      )}

      <p className="text-[9px] leading-relaxed text-slate-600">
        In-game stats, profile attributes and roles are derived FC-style from the six face stats and
        this player&apos;s identity — the face stats remain the engine&apos;s source of truth.
      </p>
    </div>
  );
}
