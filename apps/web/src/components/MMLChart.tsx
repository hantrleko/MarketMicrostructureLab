import React from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { LineChart, BarChart, ScatterChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AxisPointerComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

// Register only the lightweight chart types and components required by MML
echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AxisPointerComponent,
  CanvasRenderer
]);

export interface MMLChartProps {
  option: any;
  style?: React.CSSProperties;
  className?: string;
  theme?: string | object;
  notMerge?: boolean;
  lazyUpdate?: boolean;
}

export const MMLChart: React.FC<MMLChartProps> = ({
  option,
  style,
  className,
  theme,
  notMerge = false,
  lazyUpdate = false
}) => {
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      style={style}
      className={className}
      theme={theme}
      notMerge={notMerge}
      lazyUpdate={lazyUpdate}
    />
  );
};

export default MMLChart;
