/**
 * TerminalView.tsx — The #/terminal page: sticky status bar, ticker tape and command line,
 * the responsive panel grid, number-key shortcuts and command → panel focusing.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ASSETS, PriceTick, TimeframeInterval, getAssetBySymbol } from '../../config/assets.ts';
import { ConnectionState } from '../../services/marketDataService.ts';
import { TerminalCommand, TerminalPanel as PanelId } from '../../utils/terminalCommands.ts';
import { TerminalStatusBar } from './TerminalStatusBar.tsx';
import { TickerTape } from './TickerTape.tsx';
import { CommandLine } from './CommandLine.tsx';
import { HeatmapPanel, MonitorPanel } from './MarketPanels.tsx';
import { AssetNewsPanel, SentimentPanel, useAssetIntelligence } from './IntelligencePanels.tsx';
import { ChartPanel, CorrelationPanel, EconomicCalendarPanel, NewsFeedPanel } from './DataPanels.tsx';

interface TerminalViewProps {
  ticks: Record<string, PriceTick>;
  connectionState: ConnectionState;
  initialSymbol: string;
  timeframe: TimeframeInterval;
  onChangeTimeframe: (tf: TimeframeInterval) => void;
  onRetrySymbol: (symbol: string) => void;
  onGoToRadar: () => void;
}

const PANEL_ELEMENT_ID: Record<PanelId, string> = {
  monitor: 'panel-monitor',
  chart: 'panel-chart',
  news: 'panel-news',
  heatmap: 'panel-heatmap',
  eco: 'panel-eco',
  corr: 'panel-corr',
  top: 'panel-top',
};

const PANEL_NAME: Record<PanelId, string> = {
  monitor: 'MONITOR',
  chart: 'CHART',
  news: 'NEWS',
  heatmap: 'HEATMAP',
  eco: 'ECONOMIC CALENDAR',
  corr: 'CORRELATION 30D',
  top: 'NEWS FEED',
};

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Bloomberg-style Terminal mode: ticker, command line and multi-panel grid. */
export function TerminalView({
  ticks,
  connectionState,
  initialSymbol,
  timeframe,
  onChangeTimeframe,
  onRetrySymbol,
  onGoToRadar,
}: TerminalViewProps) {
  const [selectedSymbol, setSelectedSymbol] = useState(
    () => getAssetBySymbol(initialSymbol)?.symbol ?? ASSETS[0].symbol
  );
  const [highlight, setHighlight] = useState<PanelId | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const asset = getAssetBySymbol(selectedSymbol) ?? ASSETS[0];
  const intel = useAssetIntelligence(asset.symbol);

  const focusPanel = useCallback((panel: PanelId, scroll: boolean) => {
    setHighlight(panel);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlight(null), 1600);
    if (scroll) {
      document.getElementById(PANEL_ELEMENT_ID[panel])?.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'start',
      });
    }
  }, []);

  useEffect(
    () => () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    },
    []
  );

  // Number keys 1–6 select an asset in MONITOR order
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= ASSETS.length) {
        setSelectedSymbol(ASSETS[n - 1].symbol);
        focusPanel('monitor', false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusPanel]);

  const handleCommand = useCallback(
    (cmd: Exclude<TerminalCommand, { type: 'help' } | { type: 'error' }>): string => {
      if (cmd.type === 'radar') {
        onGoToRadar();
        return 'Back to Radar.';
      }
      if (cmd.type === 'asset') {
        setSelectedSymbol(cmd.symbol);
        focusPanel(cmd.panel, cmd.panel !== 'monitor');
        return `${cmd.code} selected → ${PANEL_NAME[cmd.panel]}`;
      }
      focusPanel(cmd.panel, true);
      return `Opening ${PANEL_NAME[cmd.panel]}`;
    },
    [focusPanel, onGoToRadar]
  );

  const selectAsset = useCallback((symbol: string) => setSelectedSymbol(symbol), []);

  return (
    <div className="terminal-mono" style={{ color: 'var(--t-text)' }}>
      <div className="sticky top-0 z-10" style={{ backgroundColor: 'var(--t-bg)' }}>
        <TerminalStatusBar connectionState={connectionState} />
        <TickerTape ticks={ticks} onSelect={selectAsset} />
        <CommandLine onCommand={handleCommand} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1 p-1">
        <MonitorPanel
          className="md:col-span-2 xl:col-span-1"
          ticks={ticks}
          selectedSymbol={asset.symbol}
          onSelect={selectAsset}
          onRetry={onRetrySymbol}
          highlighted={highlight === 'monitor'}
        />
        <ChartPanel
          className="md:col-span-2"
          asset={asset}
          timeframe={timeframe}
          onChangeTimeframe={onChangeTimeframe}
          highlighted={highlight === 'chart'}
        />
        <HeatmapPanel
          ticks={ticks}
          selectedSymbol={asset.symbol}
          onSelect={selectAsset}
          highlighted={highlight === 'heatmap'}
        />
        <SentimentPanel asset={asset} intel={intel} />
        <AssetNewsPanel asset={asset} intel={intel} highlighted={highlight === 'news'} />
        <CorrelationPanel highlighted={highlight === 'corr'} />
        <EconomicCalendarPanel highlighted={highlight === 'eco'} />
        <NewsFeedPanel highlighted={highlight === 'top'} />
      </div>
    </div>
  );
}
