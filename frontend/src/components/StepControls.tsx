/** StepControls：统一的逐步推进控制条（上一步 / 播放 / 暂停 / 下一步 / 跑完 / 复位）。 */

import { useEffect, useRef } from 'react';

interface StepControlsProps {
  current: number;
  total: number;
  onChange: (step: number) => void;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  speedMs?: number;
}

export function StepControls({
  current,
  total,
  onChange,
  playing,
  onPlayingChange,
  speedMs = 1100,
}: StepControlsProps) {
  const timerRef = useRef<number | null>(null);
  const last = total - 1;

  useEffect(() => {
    if (!playing) return;
    if (current >= last) {
      onPlayingChange(false);
      return;
    }
    timerRef.current = window.setTimeout(() => {
      onChange(Math.min(last, current + 1));
    }, speedMs);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [playing, current, last, onChange, onPlayingChange, speedMs]);

  const btn = (disabled: boolean) => (disabled ? 'btn btn-small' : 'btn btn-small btn-primary');

  return (
    <div className="step-controls">
      <button
        type="button"
        className={btn(current <= 0)}
        disabled={current <= 0}
        onClick={() => {
          onPlayingChange(false);
          onChange(0);
        }}
        title="回到第一步"
      >
        ⏮
      </button>
      <button
        type="button"
        className={btn(current <= 0)}
        disabled={current <= 0}
        onClick={() => {
          onPlayingChange(false);
          onChange(current - 1);
        }}
      >
        上一步
      </button>
      <button
        type="button"
        className="btn btn-small btn-primary"
        onClick={() => {
          if (current >= last) onChange(0);
          onPlayingChange(!playing);
        }}
      >
        {playing ? '暂停' : current >= last ? '重新播放' : '播放'}
      </button>
      <button
        type="button"
        className={btn(current >= last)}
        disabled={current >= last}
        onClick={() => {
          onPlayingChange(false);
          onChange(current + 1);
        }}
      >
        下一步
      </button>
      <button
        type="button"
        className={btn(current >= last)}
        disabled={current >= last}
        onClick={() => {
          onPlayingChange(false);
          onChange(last);
        }}
      >
        一键跑完
      </button>
      <input
        type="range"
        min={0}
        max={last}
        value={current}
        onChange={(e) => {
          onPlayingChange(false);
          onChange(Number(e.target.value));
        }}
        className="step-slider"
        aria-label="步骤进度"
      />
      <span className="step-counter">
        {current + 1} / {total}
      </span>
    </div>
  );
}
