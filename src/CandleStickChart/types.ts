// Types

// Represents a single OHLCV candle data point. timestamp is unix seconds.
export interface Candle {
  high: number;
  low: number;
  open: number;
  close: number;
  timestamp: number;
}

// [min, max] price range for the currently visible candles
export type Domain = [number, number];

// fill is [highCandleCol, lowCandleCol]
export type AxisLinePathEffect = "dashed" | "line" | "none";

// CandleChart

export interface CandleChartProps {
  width: number;
  height: number;
  data: Candle[];
  // fill is [highCandleCol, lowCandleCol]
  fill: [string, string];
  wickColor: string;
  domain: Domain;
}

export interface CandleStickProps {
  // d3 scale: maps a price to a canvas Y coordinate
  scaleY: (value: number) => number|undefined;
  // d3 scale: maps a price delta to a canvas pixel height
  scaleBody: (value: number) => number|undefined;
  index: number;
  candleWidth: number;
  // fill is [highCandleCol, lowCandleCol]
  fill: [string, string];
  candle: Candle;
  wickColor: string;
}

export interface CandleStickChartProps {
  width: number;
  height: number;
  data: Candle[];
  bgCol?: string;
  // fill is [highCandleCol, lowCandleCol]
  fill?: [string, string];
  currency?: string;
  labelFontSize?: number;
  // horizontal offset from the right edge for the crosshair price label
  labelRightOffset?: number;
  labelFontCol?: string;
  // number of price/time labels shown on each axis
  numLabels?: number;
  axisFontColor?: string;
  axisFontSize?: number;
  // width reserved on the right for Y-axis labels
  axisLabelRightOffset?: number;
  // height reserved on the bottom for X-axis labels
  axisLabelBottomOffset?: number;
  axisLinePathEffect?: AxisLinePathEffect;
  axisLineColor?: string;
  wickColor?: string;
  crossHairColor?: string;
  maxVisibleCandles?: number;
  minVisibleCandles?: number;
}
