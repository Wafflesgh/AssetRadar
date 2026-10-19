/**
 * TerminalView.tsx — The #/terminal page: sticky status bar, price and live headline tapes,
 * command line, the function QuickBar, the responsive panel grid (MONITOR, CHART, INTEL, MOV,
 * WEI, HEATMAP, SENTIMENT, NEWS, FXC, CURV, HP, CORR, ECO, NEWS FEED), the market filter,
 * number-key shortcuts and command → panel focusing.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ASSETS, PriceTick, TimeframeInterval, getAssetBySymbol } from '../../config/assets.ts';
import { ConnectionState } from '../../services/marketDataService.ts';
import { TerminalCommand, TerminalPanel as PanelId, parseTerminalCommand } from '../../utils/terminalCommands.ts';
import { TerminalStatusBar } from './TerminalStatusBar.tsx';
import { TickerTape } from './TickerTape.tsx';
import { NewsTape } from '../NewsTape.tsx';
import { latestNewsKey, useLiveNews } from '../../hooks/useLiveNews.ts';
import { CommandLine } from './CommandLine.tsx';
import { GroupTabs, HeatmapPanel, MonitorPanel, type TerminalGroup } from './MarketPanels.tsx';
import { FxCrossPanel, MoversTerminalPanel, WorldIndicesPanel, YieldCurvePanel } from './MarketFunctionPanels.tsx';
import { HistoryPanel, IntelPanel } from './AnalysisPanels.tsx';
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
  onGoToAdvisor: () => void;
  onGoToQuant: () => void;
}

const PANEL_ELEMENT_ID: Record<PanelId, string> = {
  monitor: 'panel-monitor',
  chart: 'panel-chart',
  news: 'panel-news',
  heatmap: 'panel-heatmap',
  eco: 'panel-eco',
  corr: 'panel-corr',
  top: 'panel-top',
  intel: 'panel-intel',
  hp: 'panel-hp',
  mov: 'panel-mov',
  wei: 'panel-wei',
  fxc: 'panel-fxc',
  curv: 'panel-curv',
};

const PANEL_NAME: Record<PanelId, string> = {
  monitor: 'MONITOR',
  chart: 'CHART',
  news: 'NEWS',
  heatmap: 'HEATMAP',
  eco: 'ECONOMIC CALENDAR',
  corr: 'CORRELATION 30D',
  top: 'NEWS FEED',
  intel: 'INTEL',
  hp: 'HISTORICAL PRICES',
  mov: 'MOVERS',
  wei: 'WORLD INDICES',
  fxc: 'FX CROSS',
  curv: 'US YIELD CURVE',
};

/** QuickBar: one click runs the function (asset functions apply to the selected asset). */
const QUICK_FUNCTIONS: Array<{ label: string; command: (code: string) => string; title: string }> = [
  { label: 'GP', command: (c) => `${c} GP`, title: 'Chart' },
  { label: 'N', command: (c) => `${c} N`, title: 'Asset news' },
  { label: 'INTEL', command: (c) => `${c} INTEL`, title: 'Technical & fundamental analysis' },
  { label: 'HP', command: (c) => `${c} HP`, title: 'Historical prices' },
  { label: 'MOV', command: () => 'MOV', title: 'Biggest movers' },
  { label: 'WEI', command: () => 'WEI', title: 'World indices' },
  { label: 'FXC', command: () => 'FXC', title: 'FX cross rates' },
  { label: 'CURV', command: () => 'CURV', title: 'US yield curve' },
  { label: 'HM', command: () => 'HM', title: 'Heatmap' },
  { label: 'ECO', command: () => 'ECO', title: 'Economic calendar' },
  { label: 'CORR', command: () => 'CORR', title: 'Correlation' },
  { label: 'TOP', command: () => 'TOP', title: 'News feed' },
  { label: 'AI', command: () => 'AI', title: 'AI Advisor' },
  { label: 'QUANT', command: () => 'QUANT', title: 'Portfolio simulator' },
];

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
  onGoToAdvisor,
  onGoToQuant,
}: TerminalViewProps) {
  const [group, setGroup] = useState<TerminalGroup>('ALL');
  const groupAssets = useMemo(() => (group === 'ALL' ? ASSETS : ASSETS.filter((a) => a.group === group)), [group]);
  const groupTabs = <GroupTabs value={group} onChange={setGroup} />;
  const [selectedSymbol, setSelectedSymbol] = useState(
    () => getAssetBySymbol(initialSymbol)?.symbol ?? ASSETS[0].symbol
  );
  const [highlight, setHighlight] = useState<PanelId | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const asset = getAssetBySymbol(selectedSymbol) ?? ASSETS[0];
  const news = useLiveNews();
  // Sentiment re-scores whenever a new headline about the selected asset arrives
  const intel = useAssetIntelligence(asset.symbol, latestNewsKey(news, asset.code));

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

  // Number keys 1–9 select an asset in MONITOR order (of the current market filter)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= Math.min(9, groupAssets.length)) {
        setSelectedSymbol(groupAssets[n - 1].symbol);
        focusPanel('monitor', false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusPanel, groupAssets]);

  const handleCommand = useCallback(
    (cmd: Exclude<TerminalCommand, { type: 'help' } | { type: 'error' }>): string => {
      if (cmd.type === 'advisor') {
        onGoToAdvisor();
        return 'Opening AI Advisor.';
      }
      if (cmd.type === 'radar') {
        onGoToRadar();
        return 'Back to Radar.';
      }
      if (cmd.type === 'quant') {
        onGoToQuant();
        return 'Opening the portfolio simulator.';
      }
      if (cmd.type === 'asset') {
        setSelectedSymbol(cmd.symbol);
        focusPanel(cmd.panel, cmd.panel !== 'monitor');
        return `${cmd.code} selected → ${PANEL_NAME[cmd.panel]}`;
      }
      focusPanel(cmd.panel, true);
      return `Opening ${PANEL_NAME[cmd.panel]}`;
    },
    [focusPanel, onGoToRadar, onGoToAdvisor, onGoToQuant]
  );

  const selectAsset = useCallback((symbol: string) => setSelectedSymbol(symbol), []);

  return (
    <div className="terminal-mono" style={{ color: 'var(--t-text)' }}>
      <div className="sticky top-0 z-10" style={{ backgroundColor: 'var(--t-bg)' }}>
        <TerminalStatusBar connectionState={connectionState} />
        <TickerTape ticks={ticks} onSelect={selectAsset} />
        <NewsTape />
        <CommandLine onCommand={handleCommand} />
        <nav
          aria-label="Terminal functions"
          className="flex flex-wrap items-center gap-1 px-2 py-1 border-b text-[10px]"
          style={{ backgroundColor: 'var(--t-panel)', borderColor: 'var(--t-line)' }}
        >
          <span className="font-bold mr-1" style={{ color: 'var(--t-amber)' }}>
            {asset.code}
          </span>
          {QUICK_FUNCTIONS.map((q) => (
            <button
              key={q.label}
              type="button"
              title={q.title}
              onClick={() => {
                const cmd = parseTerminalCommand(q.command(asset.code));
                if (cmd && cmd.type !== 'help' && cmd.type !== 'error') handleCommand(cmd);
              }}
              className="px-1.5 h-5 font-bold border"
              style={{ borderColor: 'var(--t-line)', color: 'var(--t-text)', borderRadius: 2 }}
            >
              {q.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1 p-1">
        <MonitorPanel
          className="md:col-span-2 xl:col-span-1"
          ticks={ticks}
          assets={groupAssets}
          right={groupTabs}
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
        <IntelPanel asset={asset} highlighted={highlight === 'intel'} />
        <MoversTerminalPanel ticks={ticks} onSelect={selectAsset} highlighted={highlight === 'mov'} />
        <WorldIndicesPanel ticks={ticks} onSelect={selectAsset} highlighted={highlight === 'wei'} />
        <HeatmapPanel
          ticks={ticks}
          assets={groupAssets}
          right={groupTabs}
          selectedSymbol={asset.symbol}
          onSelect={selectAsset}
          highlighted={highlight === 'heatmap'}
        />
        <SentimentPanel asset={asset} intel={intel} />
        <AssetNewsPanel asset={asset} ticks={ticks} highlighted={highlight === 'news'} />
        <FxCrossPanel ticks={ticks} highlighted={highlight === 'fxc'} />
        <YieldCurvePanel highlighted={highlight === 'curv'} />
        <HistoryPanel asset={asset} highlighted={highlight === 'hp'} />
        <CorrelationPanel highlighted={highlight === 'corr'} />
        <EconomicCalendarPanel highlighted={highlight === 'eco'} />
        <NewsFeedPanel asset={asset} ticks={ticks} highlighted={highlight === 'top'} />
      </div>
    </div>
  );
}
