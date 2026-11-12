"use client";

import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/store/gameStore";
import { MatchCenter } from "@/components/match-center";
import { LeagueTable } from "@/components/league-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatDate, formatMoney, ordinal } from "@/lib/format";
import { computeTable } from "@/lib/game/season";
import { resolveInboxMessage } from "@/lib/game/career";
import { buildTaskList, type Task } from "@/lib/game/tasks";
import { answerPress } from "@/lib/game/press";
import { cn } from "@/lib/utils";
import { CalendarDays, ChevronRight, ClipboardList, CreditCard, Globe, Heart, History, Inbox, Megaphone, MessageSquare, Mic, Scale, ShieldAlert, Trophy } from "lucide-react";
import type { InboxMessage, NewsItem } from "@/lib/game/types";

const NEWS_ICON: Record<string, typeof Megaphone> = {
  match: Megaphone,
  transfer: CreditCard,
  injury: ShieldAlert,
  season: ClipboardList,
  award: History,
  cup: Trophy,
  social: MessageSquare,
  board: Scale,
};

function NewsRow({ item, onOpen }: { item: NewsItem; onOpen: (n: NewsItem) => void }) {
  const Icon = NEWS_ICON[item.type] ?? Megaphone;
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="w-full flex items-start gap-2.5 rounded-lg border border-slate-800 bg-slate-950/40 p-2.5 text-left hover:border-slate-700 transition-colors"
      aria-label={`News: ${item.title}`}
    >
      <div className="mt-0.5 h-7 w-7 shrink-0 rounded-lg bg-slate-800 flex items-center justify-center">
        <Icon className={cn("h-3.5 w-3.5", item.type === "injury" ? "text-rose-400" : item.type === "transfer" || item.type === "finance" ? "text-amber-400" : item.type === "award" ? "text-amber-300" : "text-emerald-400")} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-200 truncate">{item.title}</p>
        <p className="text-[11px] text-slate-500 line-clamp-1">{item.body}</p>
      </div>
      <ChevronRight className="h-3.5 w-3.5 text-slate-600 mt-1 shrink-0" aria-hidden />
    </button>
  );
}

/* ---------------- inbox sheet ---------------- */

function InboxSheet({ messages, onAnswer }: { messages: InboxMessage[]; onAnswer: (msgId: string, optId: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="w-full border-slate-700 text-slate-300" aria-label="Open full inbox">
          <Inbox className="h-4 w-4 mr-1.5" aria-hidden />
          Open inbox ({messages.filter((m) => !m.resolvedOptionId).length} pending / {messages.length} total)
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[80vh] bg-slate-900 border-slate-800 p-4 overflow-y-auto">
        <SheetHeader className="p-0 pb-3">
          <SheetTitle className="text-slate-100">Inbox</SheetTitle>
        </SheetHeader>
        <div className="space-y-2.5">
          {messages.length === 0 && <p className="text-xs text-slate-500">No messages. The inbox fills up as players, agents and rival clubs get talkative.</p>}
          {messages.map((m) => (
            <div key={m.id} className={cn("rounded-xl border p-3", m.resolvedOptionId ? "border-slate-800 bg-slate-950/40 opacity-70" : "border-amber-500/30 bg-amber-500/5")}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-100">{m.title}</p>
                <span className="text-[10px] text-slate-500 shrink-0">{formatDate(m.date)}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-snug">{m.body}</p>
              {m.resolvedOptionId ? (
                <p className="mt-2 text-[11px] text-emerald-400">Resolved: {m.outcome ?? m.resolvedOptionId}</p>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {m.options.map((o) => (
                    <Button
                      key={o.id}
                      size="sm"
                      variant="outline"
                      className={cn(
                        "h-9 text-[11px]",
                        o.id === "accept" || o.id === "promise" || o.id === "extend" ? "border-emerald-600/50 text-emerald-400" : "border-slate-700 text-slate-300",
                      )}
                      onClick={() => {
                        onAnswer(m.id, o.id);
                      }}
                      aria-label={`${o.label}: ${m.title}`}
                    >
                      {o.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ---------------- press conference dialog ---------------- */

function PressConference() {
  const game = useAppStore((s) => s.game);
  const dataset = useAppStore((s) => s.dataset);
  const [dismissed, setDismissed] = useState(false);
  if (!game || !dataset || !game.press) return null;
  if (dismissed) return null;
  const press = game.press;
  const current = press.questions.find((q) => !press.answered.includes(q.id));
  const done = !current;

  const answer = (optionId: string) => {
    if (!current) return;
    useAppStore.getState().update((g) => {
      answerPress(g, structuredClone(dataset), current.id, optionId);
    });
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) setDismissed(true); }}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-left flex items-center gap-2 text-base">
            <Mic className="h-4 w-4 text-amber-400" aria-hidden /> Press conference
          </DialogTitle>
          <DialogDescription className="text-left">{press.title}</DialogDescription>
        </DialogHeader>
        {current ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1">Question {press.answered.length + 1}/{press.questions.length}</p>
              <p className="text-sm text-slate-200 leading-snug">{current.question}</p>
            </div>
            <div className="space-y-2">
              {current.options.map((o) => (
                <Button
                  key={o.id}
                  variant="outline"
                  className="w-full h-auto min-h-11 justify-start text-left text-xs border-slate-700 text-slate-200 hover:border-emerald-600/50 hover:text-emerald-400"
                  onClick={() => answer(o.id)}
                  aria-label={o.label}
                >
                  {o.label}
                  <span className="ml-auto flex gap-1 shrink-0">
                    {o.morale !== 0 && (
                      <Badge variant="outline" className={cn("text-[9px] px-1", o.morale > 0 ? "border-emerald-600/50 text-emerald-400" : "border-rose-500/40 text-rose-400")}>
                        morale {o.morale > 0 ? `+${o.morale}` : o.morale}
                      </Badge>
                    )}
                    {o.board !== 0 && (
                      <Badge variant="outline" className={cn("text-[9px] px-1", o.board > 0 ? "border-emerald-600/50 text-emerald-400" : "border-rose-500/40 text-rose-400")}>
                        board {o.board > 0 ? `+${o.board}` : o.board}
                      </Badge>
                    )}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">Briefing complete. The media have their headlines.</p>
            <Button className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold" onClick={() => setDismissed(true)} aria-label="Close press conference">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- central tab ---------------- */

export function HomeTab() {
  const game = useAppStore((s) => s.game);
  const dataset = useAppStore((s) => s.dataset);
  const liveFixtureId = useAppStore((s) => s.liveFixtureId);
  const liveResult = useAppStore((s) => s.liveResult);
  const [openNews, setOpenNews] = useState<NewsItem | null>(null);

  const leagueName = useMemo(
    () => dataset?.leagues.find((l) => l.id === game?.leagueId)?.name ?? "League",
    [dataset, game],
  );

  const position = useMemo(() => {
    if (!game || !dataset) return 0;
    const teams = dataset.teams.filter((t) => t.leagueId === game.leagueId);
    const table = computeTable(teams, game.fixtures);
    return table.findIndex((r) => r.teamId === game.clubId) + 1;
  }, [game, dataset]);

  const tasks = useMemo(() => (game && dataset ? buildTaskList(game, dataset) : []), [game, dataset]);

  if (!game || !dataset) return null;
  const userTeam = dataset.teams.find((t) => t.id === game.clubId);
  const wages = game.players.reduce((s, p) => s + p.salary, 0);
  const wagePct = Math.min(100, Math.round((wages / Math.max(game.wageBudget, 1)) * 100));
  const pendingInbox = game.inbox.filter((m) => !m.resolvedOptionId);
  const confidence = game.boardConfidence ?? 60;
  const confTone = confidence >= 55 ? "bg-emerald-500" : confidence >= 30 ? "bg-amber-500" : "bg-rose-500";

  const answer = (msgId: string, optionId: string) => {
    useAppStore.getState().update((g) => {
      resolveInboxMessage(g, structuredClone(dataset), msgId, optionId);
    });
  };

  const goTask = (t: Task) => {
    useAppStore.getState().setActiveTab(t.tab);
  };

  return (
    <div className="space-y-4">
      <MatchCenter />
      <PressConference />

      {/* v6.0 task list */}
      {tasks.length > 0 && (
        <section aria-label="Task list" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
            <ClipboardList className="h-3.5 w-3.5" aria-hidden /> Task list
          </p>
          <div className="space-y-1.5">
            {tasks.slice(0, 6).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => goTask(t)}
                className="w-full flex items-start gap-2.5 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 text-left hover:border-emerald-600/40 transition-colors"
                aria-label={`Task: ${t.label}`}
              >
                <span
                  className={cn(
                    "mt-1 h-2 w-2 shrink-0 rounded-full",
                    t.severity === "high" ? "bg-rose-500" : t.severity === "medium" ? "bg-amber-500" : "bg-slate-600",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-slate-200">{t.label}</span>
                  <span className="block text-[11px] text-slate-500 truncate">{t.detail}</span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-slate-600 mt-1 shrink-0" aria-hidden />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* season status strip */}
      <section aria-label="Season overview" className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Position</p>
          <p className="text-lg font-black text-emerald-400">{position > 0 ? ordinal(position) : "-"}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Objective</p>
          <p className="text-lg font-black text-slate-200">Top {game.seasonObjective.targetPosition}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Budget</p>
          <p className="text-lg font-black text-slate-200">{formatMoney(game.transferBudget)}</p>
        </div>
      </section>

      {/* v4.2 board confidence */}
      <section aria-label="Board confidence" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-semibold text-slate-300">
            <Scale className="h-3.5 w-3.5 text-amber-400" aria-hidden /> Board confidence
          </span>
          <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-400">
            Cup: {game.seasonObjective.cupTarget === "win" ? "win it" : game.seasonObjective.cupTarget === "final" ? "reach final" : "no target"}
          </Badge>
        </div>
        <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden">
          <div className={cn("h-full rounded-full transition-all duration-500", confTone)} style={{ width: `${confidence}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-slate-500">
          <span>{confidence >= 70 ? "The board loves you" : confidence >= 45 ? "Keep winning" : confidence >= 25 ? "Under pressure" : "Sack talk in the press..."}</span>
          <span>Manager rep {game.managerRep ?? 40}</span>
        </div>
      </section>

      {/* v4.1 inbox — player conversations (top 3 inline) */}
      {pendingInbox.length > 0 && (
        <section aria-label="Inbox messages" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-400 mb-2 flex items-center gap-1.5">
            <Inbox className="h-3.5 w-3.5" aria-hidden /> Inbox ({pendingInbox.length})
          </p>
          <div className="space-y-2">
            {pendingInbox.slice(0, 3).map((m) => (
              <div key={m.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                <p className="text-xs font-bold text-slate-100">{m.title}</p>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{m.body}</p>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {m.options.map((o) => (
                    <Button
                      key={o.id}
                      size="sm"
                      variant="outline"
                      className={cn(
                        "h-8 text-[11px]",
                        o.id === "accept" || o.id === "promise" || o.id === "extend"
                          ? "border-emerald-600/50 text-emerald-400"
                          : "border-slate-700 text-slate-300",
                      )}
                      onClick={() => answer(m.id, o.id)}
                      aria-label={`${o.label}: ${m.title}`}
                    >
                      {o.label}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <InboxSheet messages={game.inbox} onAnswer={answer} />

      {/* wage / FFP */}
      <section aria-label="Finance overview" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-slate-400">
            <CreditCard className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
            Wage bill {formatMoney(wages)} / {formatMoney(game.wageBudget)} per week
          </span>
          <Badge variant="outline" className={cn("text-[10px]", wagePct >= 70 ? "border-rose-500/40 text-rose-400" : "border-emerald-500/30 text-emerald-400")}>
            {wagePct}% {wagePct >= 70 ? "FFP risk" : "FFP ok"}
          </Badge>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden">
          <div className={cn("h-full rounded-full", wagePct >= 70 ? "bg-rose-500" : "bg-emerald-500")} style={{ width: `${wagePct}%` }} />
        </div>
      </section>

      {/* next fixture date hint */}
      {(() => {
        if (liveFixtureId || liveResult) return null;
        const nf = game.fixtures.find((f) => !f.played && (f.homeId === game.clubId || f.awayId === game.clubId));
        if (!nf) return null;
        const oppId = nf.homeId === game.clubId ? nf.awayId : nf.homeId;
        const opp = dataset.teams.find((t) => t.id === oppId);
        return (
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
            <CalendarDays className="h-3 w-3" aria-hidden />
            Next: {opp?.shortName} on {formatDate(nf.date)} · <Globe className="h-3 w-3" aria-hidden /> {leagueName}
          </p>
        );
      })()}

      {/* league table */}
      <section aria-label="League standings">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{leagueName}</h2>
          <span className="text-[10px] text-slate-600">{userTeam?.name}</span>
        </div>
        <LeagueTable dataset={dataset} leagueId={game.leagueId} fixtures={game.fixtures} clubId={game.clubId} limit={6} />
      </section>

      {/* v4.1 Quattrick Social */}
      {game.social.length > 0 && (
        <section aria-label="Quattrick Social feed">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" aria-hidden /> Club Buzz
          </h2>
          <div className="space-y-2">
            {game.social.slice(0, 4).map((p) => (
              <div key={p.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-2.5">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-[9px] font-black",
                    p.tone === "hype" ? "bg-emerald-500/20 text-emerald-300" : p.tone === "mock" ? "bg-rose-500/20 text-rose-300" : "bg-slate-700 text-slate-300",
                  )} aria-hidden>{p.handle.slice(0, 2).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-slate-200 truncate">{p.handle} <span className="text-slate-500 font-normal">{p.tag}</span></p>
                  </div>
                  <span className="flex items-center gap-0.5 text-[10px] text-slate-500 shrink-0"><Heart className="h-3 w-3" aria-hidden />{p.likes > 999 ? `${(p.likes / 1000).toFixed(1)}K` : p.likes}</span>
                </div>
                <p className="text-xs text-slate-300 mt-1.5 leading-snug">{p.text}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* news feed */}
      <section aria-label="Club news feed">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">News feed</h2>
        <div className="space-y-2">
          {game.news.slice(0, 6).map((n) => (
            <NewsRow key={n.id} item={n} onOpen={setOpenNews} />
          ))}
          {game.news.length === 0 && <p className="text-xs text-slate-600">No news yet.</p>}
        </div>
      </section>

      {/* news detail dialog */}
      <Dialog open={openNews !== null} onOpenChange={(o) => !o && setOpenNews(null)}>
        <DialogContent className="max-w-[400px]">
          {openNews && (
            <>
              <DialogHeader>
                <DialogTitle className="text-left text-base">{openNews.title}</DialogTitle>
                <DialogDescription className="text-left">{formatDate(openNews.date)}</DialogDescription>
              </DialogHeader>
              <p className="text-sm text-slate-300 leading-relaxed">{openNews.body}</p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
