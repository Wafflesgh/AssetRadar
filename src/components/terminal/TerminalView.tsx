/**
 * TerminalView.tsx — The #/terminal page: sticky status bar, price and live headline tapes,
 * command line, the function QuickBar, the responsive panel grid (MONITOR, CHART, INTEL, MOV,
 * WEI, HEATMAP, SENTIMENT, NEWS, FXC, CURV, HP, CORR, ECO, NEWS FEED), the market filter,
 * number-key shortcuts and command → panel focusing.
 */
import { t as tr, useLang, useT, type TranslationKey } from '../../i18n/index.ts';
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
import { FxCrossPanel, BriefPanel, IdMacroPanel, MoversTerminalPanel, WorldIndicesPanel, YieldCurvePanel } from './MarketFunctionPanels.tsx';
import { CalendarTerminalPanel, HistoryPanel, IntelPanel } from './AnalysisPanels.tsx';
import { AssetNewsPanel, SentimentPanel, useAssetIntelligence } from './IntelligencePanels.tsx';
import { ChartPanel, CorrelationPanel, EconomicCalendarPanel, NewsFeedPanel } from './DataPanels.tsx';
import { BinancePanel, LevelsPanel, RankingsPanel, SentimentV2Panel } from './SentimentPanels.tsx';

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
  onCompare?: (symbols: string[]) => void;
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
  cal: 'panel-cal',
  idmacro: 'panel-idmacro',
  sent: 'panel-sent',
  lvl: 'panel-lvl',
  rank: 'panel-rank',
  bnb: 'panel-bnb',
  brief: 'panel-brief',
};

/** Panel name for the command feedback, in the current language. */
const panelName = (panel: PanelId) => tr(`term.title.${panel}` as TranslationKey).toUpperCase();

/** QuickBar: one click runs the function (asset functions apply to the selected asset). */
const QUICK_FUNCTIONS: Array<{ label: string; command: (code: string) => string; title: TranslationKey }> = [
  { label: 'GP', command: (c) => `${c} GP`, title: 'term.title.chart' },
  { label: 'N', command: (c) => `${c} N`, title: 'term.quick.news' },
  { label: 'INTEL', command: (c) => `${c} INTEL`, title: 'term.fn.INTEL' },
  { label: 'HP', command: (c) => `${c} HP`, title: 'term.title.hp' },
  { label: 'CAL', command: (c) => `${c} CAL`, title: 'term.fn.CAL' },
  { label: 'SENT', command: (c) => `${c} SENT`, title: 'term.fn.SENT' },
  { label: 'LVL', command: (c) => `${c} LVL`, title: 'term.fn.LVL' },
  { label: 'RANK', command: () => 'RANK', title: 'term.panel.RANK' },
  { label: 'BNB', command: () => 'BINANCE', title: 'term.panel.BINANCE' },
  { label: 'MOV', command: () => 'MOV', title: 'term.panel.MOV' },
  { label: 'WEI', command: () => 'WEI', title: 'term.title.wei' },
  { label: 'FXC', command: () => 'FXC', title: 'term.panel.FXC' },
  { label: 'CURV', command: () => 'CURV', title: 'term.title.curv' },
  { label: 'IDMACRO', command: () => 'IDMACRO', title: 'term.title.idmacro' },
  { label: 'BRIEF', command: () => 'BRIEF', title: 'term.panel.BRIEF' },
  { label: 'HM', command: () => 'HM', title: 'term.title.heatmap' },
  { label: 'ECO', command: () => 'ECO', title: 'term.title.eco' },
  { label: 'CORR', command: () => 'CORR', title: 'term.panel.CORR' },
  { label: 'TOP', command: () => 'TOP', title: 'term.title.top' },
  { label: 'AI', command: () => 'AI', title: 'term.sug.AI' },
  { label: 'QUANT', command: () => 'QUANT', title: 'term.sug.QUANT' },
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
  onCompare,
}: TerminalViewProps) {
  const t = useT();
  const lang = useLang();
  const [group, setGroup] = useState<TerminalGroup>('ALL');
  const groupAssets = useMemo(() => (group === 'ALL' ? ASSETS : ASSETS.filter((a) => a.group === group)), [group]);
  const groupTabs = <GroupTabs value={group} onChange={setGroup} />;
  const [selectedSymbol, setSelectedSymbol] = useState(
    () => getAssetBySymbol(initialSymbol)?.symbol ?? ASSETS[0].symbol
  );
  const [highlight, setHighlight] = useState<PanelId | null>(null);
  // Market and horizon of the RANK panel (set by "RANK IDX SHORT")
  const [rankChoice, setRankChoice] = useState<{ market: 'idx' | 'us'; horizon: 'short' | 'medium' | 'long' }>({ market: 'idx', horizon: 'medium' });
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
        return tr('term.ok.advisor');
      }
      if (cmd.type === 'radar') {
        onGoToRadar();
        return tr('term.ok.radar');
      }
      if (cmd.type === 'compare') {
        onCompare?.(cmd.symbols);
        return 'Opening Compare.';
      }
      if (cmd.type === 'quant') {
        onGoToQuant();
        return tr('term.ok.quant');
      }
      if (cmd.type === 'asset') {
        setSelectedSymbol(cmd.symbol);
        focusPanel(cmd.panel, cmd.panel !== 'monitor');
        return tr('term.ok.asset', { code: cmd.code, panel: panelName(cmd.panel) });
      }
      if (cmd.type === 'binancePair') {
        window.location.hash = `#/crypto/${encodeURIComponent(cmd.pair)}`;
        return tr('term.ok.pair', { pair: cmd.pair });
      }
      if (cmd.panel === 'rank' && cmd.market) setRankChoice({ market: cmd.market, horizon: cmd.horizon ?? 'medium' });
      focusPanel(cmd.panel, true);
      return tr('term.ok.panel', { panel: panelName(cmd.panel) });
    },
    [focusPanel, onGoToRadar, onGoToAdvisor, onGoToQuant, onCompare]
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
          aria-label={t('term.functions')}
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
              title={t(q.title)}
              onClick={() => {
                const cmd = parseTerminalCommand(q.command(asset.code), lang);
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
        <SentimentV2Panel asset={asset} highlighted={highlight === 'sent'} />
        <LevelsPanel asset={asset} highlighted={highlight === 'lvl'} />
        <RankingsPanel onSelect={selectAsset} highlighted={highlight === 'rank'} choice={rankChoice} onChoice={setRankChoice} />
        <BinancePanel highlighted={highlight === 'bnb'} />
        <AssetNewsPanel asset={asset} ticks={ticks} highlighted={highlight === 'news'} />
        <FxCrossPanel ticks={ticks} highlighted={highlight === 'fxc'} />
        <YieldCurvePanel highlighted={highlight === 'curv'} />
        <HistoryPanel asset={asset} highlighted={highlight === 'hp'} />
        <CalendarTerminalPanel asset={asset} onSelect={selectAsset} highlighted={highlight === 'cal'} />
        <IdMacroPanel highlighted={highlight === 'idmacro'} />
        <BriefPanel highlighted={highlight === 'brief'} />
        <CorrelationPanel highlighted={highlight === 'corr'} />
        <EconomicCalendarPanel highlighted={highlight === 'eco'} />
        <NewsFeedPanel asset={asset} ticks={ticks} highlighted={highlight === 'top'} />
      </div>
    </div>
  );
}
