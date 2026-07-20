"use client";

export type PipelineStage = {
  id: string;
  name: string;
  sort_order: number;
  probability: number;
  is_won: boolean | number;
  is_lost: boolean | number;
};

function isFlag(v: boolean | number | undefined): boolean {
  return v === true || v === 1;
}

function stageKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function matchStageByStatus(
  stages: PipelineStage[],
  status: string | null | undefined,
): PipelineStage | null {
  if (!stages.length) return null;
  const raw = String(status || "").trim().toLowerCase();
  if (!raw) return stages[0] || null;
  return (
    stages.find((s) => stageKey(s.name) === raw) ||
    stages.find((s) => s.name.trim().toLowerCase() === raw) ||
    null
  );
}

export function statusKeyForStage(stage: PipelineStage): string {
  return stageKey(stage.name);
}

type Props = {
  stages: PipelineStage[];
  currentStatus: string;
  disabled?: boolean;
  busy?: boolean;
  onSelect: (stage: PipelineStage) => void;
};

/** Visual lead/opportunity-style pipeline progression. */
export function PipelineStepper({
  stages,
  currentStatus,
  disabled,
  busy,
  onSelect,
}: Props) {
  const progressive = stages.filter((s) => !isFlag(s.is_lost));
  const lost = stages.filter((s) => isFlag(s.is_lost));
  const current =
    matchStageByStatus(stages, currentStatus) || progressive[0] || null;
  const currentIndex = current
    ? progressive.findIndex((s) => s.id === current.id)
    : -1;
  const onLost = current ? isFlag(current.is_lost) : false;

  if (!stages.length) {
    return (
      <p className="text-sm text-[var(--neo-muted)]">No pipeline stages configured.</p>
    );
  }

  return (
    <div className="pipeline-stepper" aria-label="Lead pipeline">
      <ol className="pipeline-track">
        {progressive.map((stage, index) => {
          const done = !onLost && currentIndex > index;
          const active = !onLost && currentIndex === index;
          const won = isFlag(stage.is_won);
          return (
            <li
              key={stage.id}
              className={`pipeline-step ${done ? "is-done" : ""} ${
                active ? "is-active" : ""
              } ${won ? "is-won" : ""}`}
            >
              {index > 0 ? <span className="pipeline-connector" aria-hidden /> : null}
              <button
                type="button"
                className="pipeline-node"
                disabled={disabled || busy}
                title={stage.name}
                aria-current={active ? "step" : undefined}
                onClick={() => onSelect(stage)}
              >
                <span className="pipeline-dot">
                  {done || (active && won) ? "✓" : index + 1}
                </span>
                <span className="pipeline-label">{stage.name}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {lost.length ? (
        <div className="pipeline-lost-row">
          {lost.map((stage) => {
            const active = onLost && current?.id === stage.id;
            return (
              <button
                key={stage.id}
                type="button"
                className={`pipeline-lost ${active ? "is-active" : ""}`}
                disabled={disabled || busy}
                onClick={() => onSelect(stage)}
              >
                {stage.name}
              </button>
            );
          })}
        </div>
      ) : null}

      {busy ? (
        <p className="mt-2 text-xs text-[var(--neo-muted)]">Updating pipeline…</p>
      ) : null}
    </div>
  );
}

/** Compact bar for list rows. */
export function PipelineMiniBar({
  stages,
  currentStatus,
}: {
  stages: PipelineStage[];
  currentStatus: string;
}) {
  const progressive = stages.filter((s) => !isFlag(s.is_lost));
  if (!progressive.length) return null;
  const current = matchStageByStatus(stages, currentStatus);
  const onLost = current ? isFlag(current.is_lost) : false;
  const idx = current
    ? progressive.findIndex((s) => s.id === current.id)
    : 0;
  const pct = onLost
    ? 0
    : Math.round(((Math.max(idx, 0) + 1) / progressive.length) * 100);

  return (
    <div
      className="pipeline-mini"
      title={current?.name || currentStatus}
      aria-hidden
    >
      <div className="pipeline-mini-track">
        <div
          className={`pipeline-mini-fill ${onLost ? "is-lost" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="pipeline-mini-label">
        {current?.name || currentStatus || "—"}
      </span>
    </div>
  );
}
