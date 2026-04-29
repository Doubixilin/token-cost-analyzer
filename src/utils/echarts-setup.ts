import * as echarts from "echarts/core";

import { LineChart } from "echarts/charts";
import { BarChart } from "echarts/charts";
import { ScatterChart } from "echarts/charts";
import { PieChart } from "echarts/charts";
import { HeatmapChart } from "echarts/charts";
import { SankeyChart } from "echarts/charts";

import { GridComponent } from "echarts/components";
import { TooltipComponent } from "echarts/components";
import { LegendComponent } from "echarts/components";
import { TitleComponent } from "echarts/components";
import { VisualMapComponent } from "echarts/components";
import { CalendarComponent } from "echarts/components";
import { DataZoomComponent } from "echarts/components";

import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  PieChart,
  HeatmapChart,
  SankeyChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  VisualMapComponent,
  CalendarComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

export default echarts;
